import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getBucketName } from "@/lib/files";
import { S3 } from "@/lib/s3Client";

export const runtime = "nodejs";

const uploadRequestSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  size: z.number(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const validation = uploadRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { fileName, contentType } = validation.data;
    const uniqueKey = `${uuidv4()}-${fileName}`;
    const resolvedContentType = contentType || "application/octet-stream";
    const bucket = getBucketName();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: uniqueKey,
      ContentType: resolvedContentType,
      // ContentLength: size,
    });
    const presignedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 });
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
