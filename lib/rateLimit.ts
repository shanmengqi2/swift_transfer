import { createHash } from "node:crypto";
import { getSql } from "@/lib/postgres";

export type RateLimitRule = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
};

export type RateLimitCheck = {
  allowed: boolean;
  retryAfterSeconds: number;
  rule?: RateLimitRule;
};

type RateLimitRow = {
  window_start: string | Date;
  window_seconds: number;
  count: number;
  blocked_until: string | Date | null;
};

let initialization: Promise<void> | undefined;

async function ensureSchema() {
  if (!initialization) {
    initialization = (async () => {
      await getSql().query(`
        CREATE TABLE IF NOT EXISTS rate_limit_buckets (
          scope TEXT NOT NULL,
          identifier TEXT NOT NULL,
          window_start TIMESTAMPTZ NOT NULL,
          window_seconds INTEGER NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          blocked_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (scope, identifier)
        );
      `);
      await getSql().query(`
        CREATE INDEX IF NOT EXISTS rate_limit_buckets_updated_at_idx
        ON rate_limit_buckets (updated_at);
      `);
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }

  await initialization;
}

function secondsUntil(value: string | Date | null) {
  if (!value) {
    return 0;
  }

  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
}

function windowRetryAfterSeconds(row: RateLimitRow) {
  const windowStart = new Date(row.window_start).getTime();
  const windowEnd = windowStart + Number(row.window_seconds) * 1000;

  return Math.max(0, Math.ceil((windowEnd - Date.now()) / 1000));
}

export function getClientIp(request: Request) {
  const directIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (directIp) {
    return directIp;
  }

  const forwarded = request.headers.get("forwarded");
  const forwardedFor = forwarded
    ?.split(",")[0]
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("for="))
    ?.slice(4)
    .replace(/^"|"$/g, "");

  return forwardedFor || "unknown";
}

export function createRateLimitIdentifier(parts: string[]) {
  return createHash("sha256")
    .update(parts.map((part) => part.trim().toLowerCase()).join("\0"))
    .digest("hex");
}

export async function checkRateLimit(rule: RateLimitRule): Promise<RateLimitCheck> {
  await ensureSchema();

  const rows = (await getSql().query(
    `
      SELECT window_start, window_seconds, count, blocked_until
      FROM rate_limit_buckets
      WHERE scope = $1 AND identifier = $2
    `,
    [rule.scope, rule.identifier],
  )) as RateLimitRow[];
  const row = rows[0];

  if (!row) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const blockedRetryAfterSeconds = secondsUntil(row.blocked_until);
  if (blockedRetryAfterSeconds > 0) {
    return {
      allowed: false,
      retryAfterSeconds: blockedRetryAfterSeconds,
      rule,
    };
  }

  const windowRetryAfter = windowRetryAfterSeconds(row);
  if (windowRetryAfter > 0 && Number(row.count) >= rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: windowRetryAfter,
      rule,
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function checkRateLimits(
  rules: RateLimitRule[],
): Promise<RateLimitCheck> {
  for (const rule of rules) {
    const result = await checkRateLimit(rule);

    if (!result.allowed) {
      return result;
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordRateLimitFailure(rule: RateLimitRule) {
  await ensureSchema();

  await getSql().query(
    `
      INSERT INTO rate_limit_buckets (
        scope,
        identifier,
        window_start,
        window_seconds,
        count,
        blocked_until,
        updated_at
      )
      VALUES (
        $1,
        $2,
        NOW(),
        $4,
        1,
        CASE
          WHEN 1 >= $3 THEN NOW() + ($5::int * INTERVAL '1 second')
          ELSE NULL
        END,
        NOW()
      )
      ON CONFLICT (scope, identifier) DO UPDATE SET
        window_start = CASE
          WHEN rate_limit_buckets.window_start <= NOW() - ($4::int * INTERVAL '1 second')
            THEN NOW()
          ELSE rate_limit_buckets.window_start
        END,
        window_seconds = $4,
        count = CASE
          WHEN rate_limit_buckets.window_start <= NOW() - ($4::int * INTERVAL '1 second')
            THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        blocked_until = CASE
          WHEN (
            CASE
              WHEN rate_limit_buckets.window_start <= NOW() - ($4::int * INTERVAL '1 second')
                THEN 1
              ELSE rate_limit_buckets.count + 1
            END
          ) >= $3
            THEN NOW() + ($5::int * INTERVAL '1 second')
          WHEN rate_limit_buckets.blocked_until > NOW()
            THEN rate_limit_buckets.blocked_until
          ELSE NULL
        END,
        updated_at = NOW()
    `,
    [
      rule.scope,
      rule.identifier,
      rule.limit,
      rule.windowSeconds,
      rule.blockSeconds,
    ],
  );
}

export async function recordRateLimitFailures(rules: RateLimitRule[]) {
  await Promise.all(rules.map((rule) => recordRateLimitFailure(rule)));

  if (Math.random() < 0.02) {
    await getSql().query(`
      DELETE FROM rate_limit_buckets
      WHERE updated_at < NOW() - INTERVAL '2 days'
    `);
  }
}

export async function clearRateLimit(rule: RateLimitRule) {
  await ensureSchema();

  await getSql().query(
    `
      DELETE FROM rate_limit_buckets
      WHERE scope = $1 AND identifier = $2
    `,
    [rule.scope, rule.identifier],
  );
}

export async function clearRateLimits(rules: RateLimitRule[]) {
  await Promise.all(rules.map((rule) => clearRateLimit(rule)));
}
