"use client";

import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
// Clerk's useUser commented out — replaced with JWT auth via UserDetailContext
// import { useUser } from "@clerk/nextjs";
import { UserDetailContext } from "@/context/UserDetailContext";
import { Loader2, BookOpen, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Course = {
  id: number;
  courseId: string;
  courseName: string;
  userInput: string;
  type: string;
  courseLayout?: Record<string, unknown>;
  createdAt?: string;
};

function CourseList() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  // JWT auth: read user from context instead of Clerk's useUser()
  const { userDetail } = useContext(UserDetailContext);

  useEffect(() => {
    if (!userDetail) return;

    const fetchCourses = async () => {
      try {
        const response = await axios.get("/api/courses");
        setCourses(response.data.courses || []);
      } catch (error) {
        console.error("Error fetching courses:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [userDetail]);

  if (!userDetail) {
    return null;
  }

  const formatDate = (date: string | undefined) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BookOpen className="h-16 w-16 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-600 mb-2">
          No Courses Yet
        </h3>
        <p className="text-gray-500">Create your first course to get started</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h2 className="text-3xl font-bold mb-2">Your Courses</h2>
      <p className="text-gray-500 mb-8">
        Manage and access all your AI generated courses
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <div
            key={course.courseId}
            onClick={() => {
              if (course.courseId) {
                router.push(`/course/${course.courseId}`);
              }
            }}
            style={{ cursor: "pointer", pointerEvents: "auto" }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && course.courseId) {
                router.push(`/course/${course.courseId}`);
              }
            }}
          >
            <Card
              className="h-full hover:shadow-lg transition-all duration-300 hover:border-primary/50 group"
              style={{ pointerEvents: "none" }}
            >
              <CardHeader className="pb-4" style={{ pointerEvents: "auto" }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                      {course.courseName}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1 capitalize">
                      {course.type === "full-course"
                        ? "Full Course"
                        : "Quick Explain Video"}
                    </CardDescription>
                  </div>
                  <BookOpen className="h-5 w-5 text-primary/60 flex-shrink-0 mt-1" />
                </div>
              </CardHeader>

              <CardContent
                className="space-y-4"
                style={{ pointerEvents: "auto" }}
              >
                <p className="text-sm text-gray-600 line-clamp-2">
                  {course.userInput}
                </p>

                {course.courseLayout &&
                  typeof course.courseLayout === "object" &&
                  "chapters" in course.courseLayout && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <BookOpen className="h-4 w-4" />
                      <span>
                        {Array.isArray(
                          (course.courseLayout as Record<string, unknown>)
                            .chapters,
                        )
                          ? (
                              (course.courseLayout as Record<string, unknown>)
                                .chapters as Array<unknown>
                            ).length
                          : 0}{" "}
                        Chapters
                      </span>
                    </div>
                  )}

                {course.createdAt && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t">
                    <Clock className="h-3 w-3" />
                    <span>Created {formatDate(course.createdAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CourseList;
