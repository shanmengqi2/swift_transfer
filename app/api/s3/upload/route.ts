import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  createUploadObjectKey,
  getBucketName,
  normalizeUploadedContentType,
} from "@/lib/files";
import { authenticateRequest } from "@/lib/auth/guards";
import { getS3Client } from "@/lib/s3Client";
import { getUploadLimits } from "@/lib/uploadLimits";

export const runtime = "nodejs";

const uploadRequestSchema = z.object({
  fileName: z.string().min(1),
  relativePath: z.string().min(1).optional(),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  batchFileCount: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();

    const validation = uploadRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { fileName, relativePath, contentType, size, batchFileCount } =
      validation.data;
    const limits = getUploadLimits();

    if (batchFileCount > limits.maxFiles) {
      return NextResponse.json(
        { error: `You can only upload up to ${limits.maxFiles} files.` },
        { status: 413 },
      );
    }

    if (size > limits.maxFileSizeBytes) {
      return NextResponse.json(
        {
          error: `Each file must be less than ${limits.maxFileSizeMb}MB.`,
        },
        { status: 413 },
      );
    }

    let uniqueKey: string;
    try {
      uniqueKey = createUploadObjectKey({
        id: uuidv4(),
        fileName,
        relativePath,
      });
    } catch {
      return NextResponse.json(
        { error: "Invalid relative path" },
        { status: 400 },
      );
    }

    const resolvedContentType = normalizeUploadedContentType(
      fileName,
      contentType,
    );
    const bucket = getBucketName();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: uniqueKey,
      ContentType: resolvedContentType,
      ContentLength: size,
    });
    const presignedUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: 3600,
    });
    // return NextResponse.json({ presignedUrl });
    const response = {
      presignedUrl,
      uniqueKey,
    };
    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
