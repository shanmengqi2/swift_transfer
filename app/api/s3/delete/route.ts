import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { S3 } from "@/lib/s3Client";

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const key = body.key;

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const {
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
      AWS_REGION,
      S3_BUCKET_NAME,
    } = process.env;

    if (
      !AWS_ACCESS_KEY_ID ||
      !AWS_SECRET_ACCESS_KEY ||
      !AWS_REGION ||
      !S3_BUCKET_NAME
    ) {
      return NextResponse.json(
        { error: "Environment variables are not set" },
        { status: 500 },
      );
    }

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    await S3.send(command);

    return NextResponse.json(
      { message: "Object deleted successfully" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
