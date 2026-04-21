export const runtime = "nodejs";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import * as fs from "node:fs";
import * as nodeModule from "node:module";
import * as url from "node:url";

import { indexTopicRecords } from "@/lib/course-rag";
import { unauthorized, handleRouteError } from "@/lib/route-errors";
import { createDocument } from "@/services/document.service";

type PdfParseModule = typeof import("pdf-parse");
type PdfWorkerModule = typeof import("pdf-parse/worker");
type ProcessWithBuiltinModule = {
  getBuiltinModule?: (name: string) => unknown;
};

const nodeBuiltinModules: Record<string, unknown> = {
  fs,
  module: nodeModule,
  url,
};

const ensurePdfNodeRuntime = () => {
  const processWithBuiltin = process as unknown as ProcessWithBuiltinModule;

  if (typeof processWithBuiltin.getBuiltinModule === "function") {
    return;
  }

  // pdfjs-dist expects Node >= 20.16. This keeps older local Node installs quiet.
  processWithBuiltin.getBuiltinModule = (name: string) => {
    const moduleName = name.replace(/^node:/, "");
    const builtinModule = nodeBuiltinModules[moduleName];

    if (!builtinModule) {
      throw new Error(`Unsupported builtin module requested: ${name}`);
    }

    return builtinModule;
  };
};

const ensurePdfCanvasGlobals = () => {
  const globalObject = globalThis as Record<string, unknown>;

  globalObject.DOMMatrix ??= DOMMatrix;
  globalObject.ImageData ??= ImageData;
  globalObject.Path2D ??= Path2D;
};

const loadPdfParse = async () => {
  ensurePdfNodeRuntime();
  ensurePdfCanvasGlobals();
  const [{ PDFParse }, { getData }] = await Promise.all([
    import("pdf-parse") as Promise<PdfParseModule>,
    import("pdf-parse/worker") as Promise<PdfWorkerModule>,
  ]);

  PDFParse.setWorker(getData());
  return { PDFParse };
};

const deriveTopicNameFromFileName = (fileName: string) => {
  const withoutExtension = fileName.replace(/\.pdf$/i, "");
  const normalized = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || "uploaded-pdf";
};

const safeSourceFileName = (fileName: string) =>
  fileName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  try {
    const formData = await req.formData();
    const rawTopicName = String(formData.get("topicName") || "").trim();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A PDF file is required" },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 },
      );
    }

    const topicName = rawTopicName || deriveTopicNameFromFileName(file.name);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { PDFParse } = await loadPdfParse();
    const parser = new PDFParse({ data: buffer });
    let text = "";

    try {
      const parsed = await parser.getText();
      text = (parsed.text || "").trim();
    } finally {
      await parser.destroy();
    }

    if (!text) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF" },
        { status: 400 },
      );
    }

    const sourceId = `pdf_${Date.now()}_${safeSourceFileName(file.name)}`;
    const result = await indexTopicRecords({
      userId,
      topicName,
      sourceId,
      records: [text],
      metadata: {
        sourceType: "pdf",
        fileName: file.name,
      },
    });

    const namespace =
      "namespace" in result && typeof result.namespace === "string"
        ? result.namespace
        : null;

    await createDocument({
      id: sourceId,
      userId,
      title: file.name,
      topicName,
      namespace,
    });

    return NextResponse.json({
      success: true,
      indexed: result.indexed,
      namespace,
      topicName,
      documentCount: "documentCount" in result ? result.documentCount : 0,
      message: result.indexed
        ? "PDF indexed successfully"
        : "PDF was processed, but indexing is not active",
    });
  } catch (error) {
    return handleRouteError(error, "Failed to upload and index PDF");
  }
}
