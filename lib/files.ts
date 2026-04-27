export type ManagedFile = {
  bucket: string;
  key: string;
  fileName: string;
  size: number;
  lastModified: string | null;
  presignedUrl: string | null;
  presignedUrlExpiresAt: string | null;
  presignedUrlCreatedAt: string | null;
};

export function getBucketName() {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("Missing S3_BUCKET_NAME");
  }

  return bucket;
}

export function displayFileName(key: string) {
  return key.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    "",
  );
}
