import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/users";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";
import {
  checkRateLimit,
  checkRateLimits,
  clearRateLimits,
  createRateLimitIdentifier,
  getClientIp,
  recordRateLimitFailures,
  type RateLimitCheck,
  type RateLimitRule,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function createRateLimitedResponse(result: RateLimitCheck) {
  return NextResponse.json(
    { error: "Too many sign-in attempts. Try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, result.retryAfterSeconds)),
      },
    },
  );
}

function getLoginIpRateLimitRule(clientIp: string): RateLimitRule {
  return {
    scope: "auth-login:ip",
    identifier: createRateLimitIdentifier([clientIp]),
    limit: 30,
    windowSeconds: 10 * 60,
    blockSeconds: 10 * 60,
  };
}

function getLoginRateLimitRules(clientIp: string, username: string) {
  const normalizedUsername = username.trim().toLowerCase();

  return [
    getLoginIpRateLimitRule(clientIp),
    {
      scope: "auth-login:account-ip",
      identifier: createRateLimitIdentifier([normalizedUsername, clientIp]),
      limit: 5,
      windowSeconds: 10 * 60,
      blockSeconds: 15 * 60,
    },
    {
      scope: "auth-login:account",
      identifier: createRateLimitIdentifier([normalizedUsername]),
      limit: 50,
      windowSeconds: 10 * 60,
      blockSeconds: 15 * 60,
    },
  ] satisfies RateLimitRule[];
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const ipRateLimitRule = getLoginIpRateLimitRule(clientIp);
    const ipRateLimit = await checkRateLimit(ipRateLimitRule);

    if (!ipRateLimit.allowed) {
      return createRateLimitedResponse(ipRateLimit);
    }

    const body = await request.json();
    const validation = loginRequestSchema.safeParse(body);

    if (!validation.success) {
      await recordRateLimitFailures([ipRateLimitRule]);

      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const rateLimitRules = getLoginRateLimitRules(
      clientIp,
      validation.data.username,
    );
    const rateLimit = await checkRateLimits(rateLimitRules);

    if (!rateLimit.allowed) {
      return createRateLimitedResponse(rateLimit);
    }

    const user = await authenticateUser(
      validation.data.username,
      validation.data.password,
    );

    if (!user) {
      await recordRateLimitFailures(rateLimitRules);

      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    await clearRateLimits(rateLimitRules);

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
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to sign in" },
      { status: 500 },
    );
  }
}
