export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/config/db";
import { usersTable } from "@/config/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { email, name, password } = await req.json();

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "Email, name, and password are required" },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const [user] = await db
    .insert(usersTable)
    .values({ email, name, passwordHash: password })
    .returning();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    credits: user.credits,
  });
}
