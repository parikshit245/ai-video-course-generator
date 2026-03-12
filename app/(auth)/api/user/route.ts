export const runtime = "nodejs";

import { db } from "@/config/db";
import { usersTable } from "@/config/schema";
import { isDatabaseConnectionError, upsertLocalUser } from "@/lib/dbFallback";
import { eq } from "drizzle-orm";
// Clerk's currentUser commented out — replaced with JWT getCurrentUser()
// import { currentUser } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST() {
  // JWT auth: read user from JWT cookie instead of Clerk session
  const jwtUser = await getCurrentUser();
  const email = jwtUser?.email;
  const name = jwtUser?.name || "User";

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (users.length === 0) {
      const newUser = await db
        .insert(usersTable)
        .values({
          email,
          name,
        })
        .returning();

      return NextResponse.json(newUser[0]);
    }

    return NextResponse.json(users[0]);
  } catch (error) {
    if (!isDatabaseConnectionError(error)) {
      console.error("User API database error:", error);
      return NextResponse.json(
        { error: "Failed to load user profile" },
        { status: 500 },
      );
    }

    console.warn("Database unavailable in /api/user, using local fallback");
    const fallbackUser = await upsertLocalUser({ email, name });

    return NextResponse.json(fallbackUser);
  }
}
