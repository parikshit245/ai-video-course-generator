// JWT-based proxy/middleware (Next.js 16+ uses proxy.ts instead of middleware.ts)
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

// ============================================================
// CLERK MIDDLEWARE — commented out, replaced by JWT auth below
// ============================================================
// import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
//
// const isPublicRoute = createRouteMatcher([
//   '/sign-in(.*)',
//   '/sign-up(.*)',
//   '/'
// ])
//
// export default clerkMiddleware(async (auth, req) => {
//   if (!isPublicRoute(req)) {
//     await auth.protect()
//   }
// })

const PUBLIC_ROUTES: RegExp[] = [
  /^\/$/, // home
  /^\/sign-in(\/.*)?$/, // sign-in pages
  /^\/sign-up(\/.*)?$/, // sign-up pages
  /^\/api\/auth\/.*$/, // auth API endpoints (login, register, logout, me)
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((pattern) => pattern.test(pathname));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const user = await getUserFromRequest(req);

  if (!user) {
    // Return 401 JSON for API routes so clients get a proper error response
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Redirect browser navigation to sign-in
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
