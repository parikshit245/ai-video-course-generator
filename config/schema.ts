import {
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: varchar({ length: 255 }).primaryKey(),
  role: varchar({ length: 20 }).notNull().default("user"),
  createdAt: timestamp().defaultNow().notNull(),
});

export const profilesTable = pgTable("profiles", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar({ length: 255 })
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  pseudonym: varchar({ length: 255 }).notNull(),
  avatar: varchar({ length: 1024 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const coursesTable = pgTable("courses", {
  id: varchar({ length: 255 }).primaryKey(),
  userId: varchar({ length: 255 })
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar({ length: 255 }).notNull(),
  prompt: text().notNull(),
  type: varchar({ length: 100 }).notNull(),
  layout: json().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const slidesTable = pgTable("slides", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  courseId: varchar({ length: 255 })
    .notNull()
    .references(() => coursesTable.id, { onDelete: "cascade" }),
  chapterId: varchar({ length: 255 }).notNull(),
  slideKey: varchar({ length: 255 }).notNull(),
  slideIndex: integer().notNull(),
  audioFileName: varchar({ length: 255 }).notNull(),
  videoUrl: varchar({ length: 1024 }).notNull(),
  narration: json().notNull(),
  content: json().notNull(),
  html: text(),
  revealData: json().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const conversationsTable = pgTable("conversations", {
  id: varchar({ length: 255 }).primaryKey(),
  userId: varchar({ length: 255 })
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  courseId: varchar({ length: 255 }).references(() => coursesTable.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  conversationId: varchar({ length: 255 })
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  role: varchar({ length: 50 }).notNull(),
  content: text().notNull(),
  pseudonymSnapshot: varchar({ length: 255 }),
  avatarSnapshot: varchar({ length: 1024 }),
  sources: json(),
  metadata: json(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const documentsTable = pgTable("documents", {
  id: varchar({ length: 255 }).primaryKey(),
  userId: varchar({ length: 255 })
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar({ length: 255 }).notNull(),
  topicName: varchar({ length: 255 }).notNull(),
  namespace: varchar({ length: 255 }),
  createdAt: timestamp().defaultNow().notNull(),
});

export const audioMetadataTable = pgTable(
  "audio_metadata",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar({ length: 255 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    fileName: varchar({ length: 255 }).notNull(),
    s3Key: varchar({ length: 1024 }).notNull().unique(),
    url: varchar({ length: 1024 }).notNull(),
    contentType: varchar({ length: 255 }).notNull(),
    sizeBytes: integer().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("audio_metadata_user_id_idx").on(table.userId),
    createdAtIdx: index("audio_metadata_created_at_idx").on(table.createdAt),
  }),
);

export const forumThreadsTable = pgTable(
  "forum_threads",
  {
    id: uuid().primaryKey(),
    userId: varchar({ length: 255 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: varchar({ length: 255 }).notNull(),
    content: text().notNull(),
    pseudonymSnapshot: varchar({ length: 255 }).notNull(),
    avatarSnapshot: varchar({ length: 1024 }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("forum_threads_user_id_idx").on(table.userId),
    createdAtIdx: index("forum_threads_created_at_idx").on(table.createdAt),
    updatedAtIdx: index("forum_threads_updated_at_idx").on(table.updatedAt),
  }),
);

export const forumRepliesTable = pgTable(
  "forum_replies",
  {
    id: uuid().primaryKey(),
    threadId: uuid()
      .notNull()
      .references(() => forumThreadsTable.id, { onDelete: "cascade" }),
    userId: varchar({ length: 255 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    parentReplyId: uuid(),
    content: text().notNull(),
    pseudonymSnapshot: varchar({ length: 255 }).notNull(),
    avatarSnapshot: varchar({ length: 1024 }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => ({
    idThreadUnique: unique("forum_replies_id_thread_id_unique").on(
      table.id,
      table.threadId,
    ),
    threadIdIdx: index("forum_replies_thread_id_idx").on(table.threadId),
    threadParentCreatedAtIdx: index("forum_replies_thread_parent_created_at_idx").on(
      table.threadId,
      table.parentReplyId,
      table.createdAt,
    ),
    parentReplyIdIdx: index("forum_replies_parent_reply_id_idx").on(
      table.parentReplyId,
    ),
    createdAtIdx: index("forum_replies_created_at_idx").on(table.createdAt),
    parentReplyThreadFk: foreignKey({
      columns: [table.parentReplyId, table.threadId],
      foreignColumns: [table.id, table.threadId],
      name: "forum_replies_parent_reply_thread_fk",
    }).onDelete("cascade"),
  }),
);
