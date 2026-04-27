import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getBucketName } from "@/lib/files";
import { deletePresignedLink } from "@/lib/presignedLinks";
import { S3 } from "@/lib/s3Client";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const key = body.key;

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const bucket = getBucketName();

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await S3.send(command);
    deletePresignedLink(key);

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
