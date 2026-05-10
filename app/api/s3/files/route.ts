import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/guards";
import { displayFileName, getBucketName, type ManagedFile } from "@/lib/files";
import { attachPickupMetadata } from "@/lib/pickupCodes";
import { listPresignedLinks } from "@/lib/presignedLinks";
import { getS3Client } from "@/lib/s3Client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

    const bucket = getBucketName();
    const objects = [];
    let continuationToken: string | undefined;

    do {
      const response = await getS3Client().send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        }),
      );

      objects.push(...(response.Contents ?? []));
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    const keys = objects
      .map((object) => object.Key)
      .filter((key): key is string => Boolean(key));
    const links = await listPresignedLinks(keys);

    const files: ManagedFile[] = objects
      .filter((object) => Boolean(object.Key))
      .map((object) => {
        const key = object.Key as string;
        const link = links.get(key);

        return {
          bucket,
          key,
          fileName: displayFileName(key),
          size: object.Size ?? 0,
          lastModified: object.LastModified?.toISOString() ?? null,
          presignedUrl: link?.url ?? null,
          presignedUrlExpiresAt: link?.expiresAt ?? null,
          presignedUrlCreatedAt: link?.createdAt ?? null,
        };
      });

    return NextResponse.json(
      { files: await attachPickupMetadata(files) },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 },
    );
  }
}
