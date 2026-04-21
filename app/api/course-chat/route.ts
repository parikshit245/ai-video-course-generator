export const runtime = "nodejs";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getGenerationModel } from "@/lib/ai-provider";
import {
  buildCourseContextBlock,
  getCourseSnapshotByCourseId,
  queryCourseRag,
} from "@/lib/course-rag";
import { unauthorized, handleRouteError } from "@/lib/route-errors";
import {
  conversationQuerySchema,
  courseChatRequestSchema,
} from "@/lib/validators/chat";
import {
  addMessage,
  createConversation,
  getMessages,
} from "@/services/chat.service";

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const buildConversationHistory = (messages: ChatHistoryMessage[]) =>
  messages
    .slice(-8)
    .map((message) =>
      `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`,
    )
    .join("\n");

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  try {
    const body = courseChatRequestSchema.parse(await req.json());

    const conversation =
      body.conversationId
        ? { id: body.conversationId }
        : await createConversation(userId, body.courseId);

    await addMessage({
      userId,
      conversationId: conversation.id,
      role: "user",
      content: body.question,
    });

    const snapshot = await getCourseSnapshotByCourseId(userId, body.courseId);

    if (!snapshot) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ragResult = await queryCourseRag({
      userId,
      topicName: snapshot.topicName,
      question: body.question,
      topK: 6,
    });

    const contextBlock = buildCourseContextBlock(snapshot, ragResult.matches);
    const conversationHistory = buildConversationHistory(
      await getMessages(userId, conversation.id),
    );

    const model = getGenerationModel({
      provider: "local-ai",
      temperature: 0.2,
      model: "mistral:latest",
      responseFormat: "text",
    });

    const prompt = `You are a helpful course tutor inside an AI video course app.
Answer using only the course context below.
Use the recent conversation only to understand follow-up intent; do not treat it as source material.
If the context is not enough, say you do not have enough course information.
Keep the answer concise, practical, and friendly.
Format your response exactly like this:
Summary: <1-2 lines>
Key Points:
- <point 1>
- <point 2>
- <point 3 if needed>
Next Step: <single actionable suggestion>

COURSE CONTEXT:
${contextBlock}

RECENT CONVERSATION:
${conversationHistory || "No previous messages."}

USER QUESTION:
${body.question}

ANSWER:`;

    const response = await model.generateContent(prompt);
    const answer = response.response.text();

    await addMessage({
      userId,
      conversationId: conversation.id,
      role: "assistant",
      content: answer,
      sources: ragResult.matches.map((match) => match.metadata || {}),
      metadata: {
        namespace: ragResult.namespace,
        pineconeAvailable: ragResult.pineconeAvailable,
      },
    });

    return NextResponse.json({
      answer,
      conversationId: conversation.id,
      namespace: ragResult.namespace,
      sources: ragResult.matches.map((match) => match.metadata || {}),
      pineconeAvailable: ragResult.pineconeAvailable,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to answer course question");
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  try {
    const conversationId = conversationQuerySchema.parse({
      conversationId: req.nextUrl.searchParams.get("conversationId"),
    }).conversationId;

    const messages = await getMessages(userId, conversationId);

    return NextResponse.json({
      conversationId,
      messages,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to retrieve conversation");
  }
}
