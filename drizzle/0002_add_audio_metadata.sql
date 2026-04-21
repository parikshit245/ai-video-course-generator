CREATE TABLE IF NOT EXISTS "audio_metadata" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId" varchar(255) NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "fileName" varchar(255) NOT NULL,
  "s3Key" varchar(1024) NOT NULL UNIQUE,
  "url" varchar(1024) NOT NULL,
  "contentType" varchar(255) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audio_metadata_user_id_idx"
ON "audio_metadata" ("userId");

CREATE INDEX IF NOT EXISTS "audio_metadata_created_at_idx"
ON "audio_metadata" ("createdAt");
