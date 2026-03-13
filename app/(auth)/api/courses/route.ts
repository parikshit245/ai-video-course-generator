import { NextRequest, NextResponse } from "next/server";
import { db } from "@/config/db";
import { coursesTable } from "@/config/schema";
import { isDatabaseConnectionError, getLocalCourse } from "@/lib/dbFallback";
import { eq } from "drizzle-orm";
import { getUserEmailFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const userEmail = getUserEmailFromRequest(req);

    if (!userEmail) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    const courses = await db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.userId, userEmail));

    return NextResponse.json({
      courses: courses.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      ),
    });
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.warn(
        "Database unavailable in /api/courses, using local fallback",
      );
      return NextResponse.json({ courses: [] });
    }

    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 },
    );
  }
}
