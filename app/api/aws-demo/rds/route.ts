export const runtime = "nodejs";

import os from "node:os";

import { count, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { databaseProvider, db } from "@/config/db";
import {
  audioMetadataTable,
  conversationsTable,
  messagesTable,
  usersTable,
} from "@/config/schema";
import { handleRouteError } from "@/lib/route-errors";

const demoEnabled = () =>
  process.env.AWS_DEMO_ENABLED === "true" ||
  process.env.NODE_ENV !== "production";

const requireDemoEnabled = () => {
  if (demoEnabled()) {
    return null;
  }

  return NextResponse.json(
    { error: "AWS demo routes are disabled. Set AWS_DEMO_ENABLED=true." },
    { status: 403 },
  );
};

const demoUserId = "aws-demo-user";

const getTableCounts = async () => {
  const [users] = await db.select({ value: count() }).from(usersTable);
  const [conversations] = await db
    .select({ value: count() })
    .from(conversationsTable);
  const [messages] = await db.select({ value: count() }).from(messagesTable);
  const [audioMetadata] = await db
    .select({ value: count() })
    .from(audioMetadataTable);

  return {
    users: users?.value ?? 0,
    conversations: conversations?.value ?? 0,
    messages: messages?.value ?? 0,
    audioMetadata: audioMetadata?.value ?? 0,
  };
};

const getLatestDemoRows = async () => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, demoUserId))
    .limit(1);

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, demoUserId))
    .orderBy(desc(conversationsTable.createdAt))
    .limit(3);

  const audioMetadata = await db
    .select()
    .from(audioMetadataTable)
    .where(eq(audioMetadataTable.userId, demoUserId))
    .orderBy(desc(audioMetadataTable.createdAt))
    .limit(3);

  const latestConversation = conversations[0];
  const messages = latestConversation
    ? await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, latestConversation.id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(5)
    : [];

  return {
    user: user ?? null,
    conversations,
    messages,
    audioMetadata,
  };
};

const getFirstRow = <T>(result: unknown) => {
  if (Array.isArray(result)) {
    return (result[0] ?? null) as T | null;
  }

  const rows = (result as { rows?: T[] } | null)?.rows;
  return rows?.[0] ?? null;
};

export async function GET() {
  const disabled = requireDemoEnabled();
  if (disabled) return disabled;

  try {
    const dbInfoResult = await db.execute<{
      currentDatabase: string;
      currentSchema: string;
    }>(
      sql`select current_database() as "currentDatabase", current_schema() as "currentSchema"`,
    );
    const dbInfo = getFirstRow<{
      currentDatabase: string;
      currentSchema: string;
    }>(dbInfoResult);

    return NextResponse.json({
      ok: true,
      message: "RDS PostgreSQL check succeeded",
      instance: os.hostname(),
      provider: databaseProvider,
      database: dbInfo ?? null,
      counts: await getTableCounts(),
      latestDemoRows: await getLatestDemoRows(),
    });
  } catch (error) {
    return handleRouteError(error, "Failed to check RDS demo data");
  }
}

export async function POST() {
  const disabled = requireDemoEnabled();
  if (disabled) return disabled;

  try {
    const now = new Date();
    const suffix = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const conversationId = `aws-demo-chat-${suffix}`;
    const s3Key = `audio/aws-demo-${suffix}.mp3`;

    await db
      .insert(usersTable)
      .values({
        id: demoUserId,
        role: "user",
        createdAt: now,
      })
      .onConflictDoNothing({ target: usersTable.id });

    const [conversation] = await db
      .insert(conversationsTable)
      .values({
        id: conversationId,
        userId: demoUserId,
        courseId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(messagesTable).values([
      {
        conversationId,
        role: "user",
        content: "AWS demo query: explain what IBEX stores in RDS.",
        metadata: { source: "aws-rds-demo" },
        createdAt: now,
      },
      {
        conversationId,
        role: "assistant",
        content:
          "IBEX stores users, chat conversations, AI responses, and audio metadata in RDS PostgreSQL.",
        metadata: { source: "aws-rds-demo" },
        createdAt: now,
      },
    ]);

    const [audioMetadata] = await db
      .insert(audioMetadataTable)
      .values({
        userId: demoUserId,
        fileName: `aws-demo-${suffix}.mp3`,
        s3Key,
        url: `s3://${process.env.AWS_BUCKET_NAME || "ibex-demo-bucket"}/${s3Key}`,
        contentType: "audio/mpeg",
        sizeBytes: 1024,
        createdAt: now,
      })
      .returning();

    return NextResponse.json({
      ok: true,
      message: "Inserted demo user, chat history, and audio metadata into RDS",
      instance: os.hostname(),
      provider: databaseProvider,
      inserted: {
        userId: demoUserId,
        conversation,
        audioMetadata,
      },
      counts: await getTableCounts(),
    });
  } catch (error) {
    return handleRouteError(error, "Failed to insert RDS demo data");
  }
}
