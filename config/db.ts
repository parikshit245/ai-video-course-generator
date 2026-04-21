import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/config/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const databaseProvider =
  process.env.DATABASE_PROVIDER?.toLowerCase() === "postgres"
    ? "postgres"
    : "neon";

const createPostgresPool = () =>
  new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : {
            rejectUnauthorized: false,
          },
  });

export const db =
  databaseProvider === "postgres"
    ? drizzlePostgres(createPostgresPool(), { schema })
    : drizzleNeon(neon(databaseUrl), { schema });
