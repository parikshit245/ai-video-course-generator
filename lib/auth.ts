import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const JWT_SECRET =
  process.env.JWT_SECRET ?? "change-this-jwt-secret-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "jwt_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type JWTUser = {
  id: number;
  email: string;
  name: string;
};

export async function signToken(user: JWTUser): Promise<string> {
  return new SignJWT({ id: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as number,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

/** Server component / API route (Node.js): read user from cookie */
export async function getCurrentUser(): Promise<JWTUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Middleware / Edge runtime: read user from request */
export async function getUserFromRequest(
  req: NextRequest,
): Promise<JWTUser | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Set the JWT auth cookie on a NextResponse */
export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

/** Clear the JWT auth cookie on a NextResponse */
export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
