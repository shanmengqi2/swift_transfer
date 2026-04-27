import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBucketName } from "@/lib/files";
import { getPresignedLink, savePresignedLink } from "@/lib/presignedLinks";
import { S3 } from "@/lib/s3Client";

export const runtime = "nodejs";

const downloadRequestSchema = z.object({
  key: z.string().min(1),
  expiresInSeconds: z.number().int().min(60).max(604800),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = downloadRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { key, expiresInSeconds } = validation.data;
    const bucket = getBucketName();
    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + expiresInSeconds * 1000,
    ).toISOString();
    const url = await getSignedUrl(
      S3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );

    const link = {
      key,
      bucket,
      url,
      expiresAt,
      expiresInSeconds,
      createdAt: createdAt.toISOString(),
    };

    savePresignedLink(link);

    return NextResponse.json({ link }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 });
  }

  return NextResponse.json({ link: getPresignedLink(key) }, { status: 200 });
}
