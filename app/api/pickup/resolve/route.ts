import { HeadObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureSevenDayDownloadLink } from "@/lib/downloadLinks";
import { getBucketName } from "@/lib/files";
import {
  getPickupShareByCode,
  isPickupCodeExpired,
  isPickupCodeRevoked,
  type PickupFileLink,
} from "@/lib/pickupCodes";
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
import { getS3Client } from "@/lib/s3Client";

export const runtime = "nodejs";

const resolvePickupSchema = z.object({
  code: z.string().trim().min(6).max(6),
});

function createRateLimitedResponse(result: RateLimitCheck) {
  return NextResponse.json(
    { error: "Too many pickup code attempts. Try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, result.retryAfterSeconds)),
      },
    },
  );
}

function getPickupIpRateLimitRule(clientIp: string): RateLimitRule {
  return {
    scope: "pickup-resolve:ip",
    identifier: createRateLimitIdentifier([clientIp]),
    limit: 60,
    windowSeconds: 10 * 60,
    blockSeconds: 10 * 60,
  };
}

function getPickupRateLimitRules(clientIp: string, code: string) {
  const normalizedCode = code.trim();

  return [
    getPickupIpRateLimitRule(clientIp),
    {
      scope: "pickup-resolve:code-ip",
      identifier: createRateLimitIdentifier([normalizedCode, clientIp]),
      limit: 8,
      windowSeconds: 10 * 60,
      blockSeconds: 15 * 60,
    },
    {
      scope: "pickup-resolve:code",
      identifier: createRateLimitIdentifier([normalizedCode]),
      limit: 100,
      windowSeconds: 10 * 60,
      blockSeconds: 15 * 60,
    },
  ] satisfies RateLimitRule[];
}

async function objectExists(bucket: string, key: string) {
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    return true;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.name === "NotFound" || error.$metadata.httpStatusCode === 404)
    ) {
      return false;
    }

    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const ipRateLimitRule = getPickupIpRateLimitRule(clientIp);
    const ipRateLimit = await checkRateLimit(ipRateLimitRule);

    if (!ipRateLimit.allowed) {
      return createRateLimitedResponse(ipRateLimit);
    }

    const body = await request.json();
    const validation = resolvePickupSchema.safeParse(body);

    if (!validation.success) {
      await recordRateLimitFailures([ipRateLimitRule]);

      return NextResponse.json({ error: "Invalid pickup code" }, { status: 400 });
    }

    const rateLimitRules = getPickupRateLimitRules(
      clientIp,
      validation.data.code,
    );
    const rateLimit = await checkRateLimits(rateLimitRules);

    if (!rateLimit.allowed) {
      return createRateLimitedResponse(rateLimit);
    }

    const pickupShare = await getPickupShareByCode(validation.data.code);

    if (
      !pickupShare ||
      isPickupCodeRevoked(pickupShare.revokedAt) ||
      isPickupCodeExpired(pickupShare.expiresAt)
    ) {
      await recordRateLimitFailures(rateLimitRules);

      return NextResponse.json(
        { error: "Pickup code is invalid or expired" },
        { status: 404 },
      );
    }

    const defaultBucket = getBucketName();
    const files: PickupFileLink[] = await Promise.all(
      pickupShare.files.map(async (file) => {
        const bucket = file.bucket || defaultBucket;
        const exists = await objectExists(bucket, file.key);

        if (!exists) {
          return {
            ...file,
            bucket,
            exists: false,
            downloadUrl: null,
            downloadUrlExpiresAt: null,
          };
        }

        const link = await ensureSevenDayDownloadLink(file.key);

        return {
          ...file,
          bucket,
          exists: true,
          downloadUrl: link.url,
          downloadUrlExpiresAt: link.expiresAt,
        };
      }),
    );

    await clearRateLimits(rateLimitRules);

    return NextResponse.json(
      {
        pickup: {
          code: pickupShare.code,
          expiresAt: pickupShare.expiresAt,
          files,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to resolve pickup code" },
      { status: 500 },
    );
  }
}
