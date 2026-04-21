export const runtime = "nodejs";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getGenerationModel } from "@/lib/ai-provider";
import {
  buildTopicContextFromMatches,
  queryTopicRecords,
} from "@/lib/course-rag";
import { unauthorized, handleRouteError } from "@/lib/route-errors";
import {
  conversationQuerySchema,
  homeChatRequestSchema,
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

type RetrievedMatch = {
  metadata?: Record<string, unknown>;
};

const trimForPrompt = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}\n[Trimmed for local model context]`;
};

const getMatchText = (match: RetrievedMatch) => {
  const text = match.metadata?.text;
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
};

const compactAnswerFallback = (matches: RetrievedMatch[]) => {
  const snippets = matches
    .map(getMatchText)
    .filter(Boolean)
    .slice(0, 3)
    .map((snippet) =>
      snippet.length > 280 ? `${snippet.slice(0, 280).trim()}...` : snippet,
    );

  if (!snippets.length) {
    return [
      "Summary: I found the topic namespace, but could not extract usable answer text.",
      "Key Points:",
      "- The PDF is indexed, but the local model could not complete the answer.",
      "- Try asking a shorter, more specific question.",
      "Next Step: Restart Ollama and ask again.",
    ].join("\n");
  }

  return [
    "Summary: I found relevant PDF text, but the local model failed before it could write a full answer.",
    "Key Points:",
    ...snippets.map((snippet) => `- ${snippet}`),
    "Next Step: Ask a narrower question, or restart Ollama if this repeats.",
  ].join("\n");
};

const normalizeGenerationError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "Unknown error",
  };
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
    const body = homeChatRequestSchema.parse(await req.json());

    const conversation =
      body.conversationId
        ? { id: body.conversationId }
        : await createConversation(userId, null);

    await addMessage({
      userId,
      conversationId: conversation.id,
      role: "user",
      content: body.question,
    });

    const ragResult = await queryTopicRecords({
      userId,
      topicName: body.topicName,
      question: body.question,
      topK: 4,
    });

    if (!ragResult.matches.length) {
      const answer =
        "I could not find records for this topic yet. Please upload a PDF so I can learn this topic first.";

      await addMessage({
        userId,
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
      });

      return NextResponse.json({
        answer,
        conversationId: conversation.id,
        needUpload: true,
        namespace: ragResult.namespace,
        pineconeAvailable: ragResult.pineconeAvailable,
      });
    }

    const context = trimForPrompt(
      buildTopicContextFromMatches(ragResult.matches),
      4500,
    );
    const conversationHistory = trimForPrompt(
      buildConversationHistory(await getMessages(userId, conversation.id)),
      1500,
    );
    const model = getGenerationModel({
      provider: "local-ai",
      temperature: 0.2,
      model: "mistral:latest",
      responseFormat: "text",
    });

    const prompt = `You are a helpful tutor. Answer only using the context.
Use the recent conversation only to understand follow-up intent; do not treat it as source material.
If context is insufficient, explicitly say so.
Keep answers concise and practical.
Format your response exactly like this:
Summary: <1-2 lines>
Key Points:
- <point 1>
- <point 2>
- <point 3 if needed>
Next Step: <single actionable suggestion>

TOPIC:
${body.topicName}

CONTEXT:
${context}

RECENT CONVERSATION:
${conversationHistory || "No previous messages."}

QUESTION:
${body.question}

ANSWER:`;

    const generateAnswer = async (modelPrompt: string) => {
      const response = await model.generateContent(modelPrompt);
      return response.response.text().trim();
    };

    const compactPrompt = `You are a helpful tutor. Answer only using the PDF context.
If the context is insufficient, say so.
Keep the answer short and practical.

PDF CONTEXT:
${trimForPrompt(context, 2200)}

QUESTION:
${body.question}

ANSWER:`;

    let answer = "";

    try {
      answer = await generateAnswer(prompt);
    } catch (error) {
      console.warn(
        "Home chat full prompt failed; retrying compact prompt",
        normalizeGenerationError(error),
      );

      try {
        answer = await generateAnswer(compactPrompt);
      } catch (compactError) {
        console.warn(
          "Home chat compact prompt failed; returning retrieved context fallback",
          normalizeGenerationError(compactError),
        );
        answer = compactAnswerFallback(ragResult.matches);
      }
    }

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
      needUpload: false,
      namespace: ragResult.namespace,
      sources: ragResult.matches.map((match) => match.metadata || {}),
      pineconeAvailable: ragResult.pineconeAvailable,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to process home chat query");
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
