import { NextRequest } from "next/server";

export type SimpleUser = {
  id: number;
  email: string;
  name: string;
};

/** Read the logged-in user's email from the x-user-email request header */
export function getUserEmailFromRequest(req: NextRequest): string | null {
  return req.headers.get("x-user-email");
}
