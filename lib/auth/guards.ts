import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function authenticateRequest(request: Request) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { session, response: null };
}
