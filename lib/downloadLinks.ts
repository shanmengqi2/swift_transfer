import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getBucketName } from "@/lib/files";
import { getPresignedLink, savePresignedLink } from "@/lib/presignedLinks";
import { getS3Client } from "@/lib/s3Client";

export const MAX_PRESIGNED_DOWNLOAD_SECONDS = 604800;

export type DownloadLink = {
  key: string;
  bucket: string;
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
  createdAt: string;
};

export function isPresignedLinkValid(expiresAt: string | null) {
  return expiresAt ? new Date(expiresAt).getTime() > Date.now() : false;
}

export async function createPresignedDownloadLink(
  key: string,
  expiresInSeconds: number,
) {
  const bucket = getBucketName();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + expiresInSeconds * 1000,
  ).toISOString();
  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );

  const link: DownloadLink = {
    key,
    bucket,
    url,
    expiresAt,
    expiresInSeconds,
    createdAt: createdAt.toISOString(),
  };

  await savePresignedLink(link);

  return link;
}

export async function ensureSevenDayDownloadLink(key: string) {
  const existingLink = await getPresignedLink(key);

  if (existingLink && isPresignedLinkValid(existingLink.expiresAt)) {
    return existingLink;
  }

  return createPresignedDownloadLink(key, MAX_PRESIGNED_DOWNLOAD_SECONDS);
}
