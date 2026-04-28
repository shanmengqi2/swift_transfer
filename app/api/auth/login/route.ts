import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/users";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

export const runtime = "nodejs";

const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = loginRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const user = await authenticateUser(
      validation.data.username,
      validation.data.password,
    );

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const response = NextResponse.json(
      { user: { username: user.username } },
      { status: 200 },
    );
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: await createSessionToken(user.username),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to sign in" },
      { status: 500 },
    );
  }
}
