import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/guards";
import { getBucketName } from "@/lib/files";
import { deletePresignedLink } from "@/lib/presignedLinks";
import { getS3Client } from "@/lib/s3Client";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

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

    await getS3Client().send(command);
    await deletePresignedLink(key);

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
