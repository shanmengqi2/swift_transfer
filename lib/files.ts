export type ManagedFile = {
  bucket: string;
  key: string;
  fileName: string;
  displayPath: string;
  parentPath: string;
  size: number;
  lastModified: string | null;
  presignedUrl: string | null;
  presignedUrlExpiresAt: string | null;
  presignedUrlCreatedAt: string | null;
  pickupCodeCount?: number;
};

export function getBucketName() {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("Missing S3_BUCKET_NAME");
  }

  return bucket;
}

export function displayFileName(key: string) {
  return getDisplayFileName(key);
}

function stripUuidPrefix(value: string) {
  return value.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    "",
  );
}

export function normalizeUploadedFileName(fileName: string) {
  return fileName.replace(/\.app\.zip$/i, ".app");
}

function splitObjectKey(key: string) {
  return key.split("/").filter(Boolean);
}

export function getDisplayFileName(key: string) {
  const segments = splitObjectKey(key);
  const fileName = segments.at(-1) ?? key;

  return stripUuidPrefix(fileName);
}

export function getObjectParentPath(key: string) {
  const segments = splitObjectKey(key);
  segments.pop();

  return segments.join("/");
}

export function getObjectDisplayPath(key: string) {
  const parentPath = getObjectParentPath(key);
  const fileName = getDisplayFileName(key);

  return parentPath ? `${parentPath}/${fileName}` : fileName;
}

export function normalizeUploadRelativePath(relativePath: string) {
  const normalizedSeparators = relativePath.replaceAll("\\", "/").trim();

  if (
    !normalizedSeparators ||
    normalizedSeparators.startsWith("/") ||
    normalizedSeparators.includes("//")
  ) {
    throw new Error("Invalid relative path");
  }

  const segments = normalizedSeparators.split("/");

  if (
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    )
  ) {
    throw new Error("Invalid relative path");
  }

  return segments.join("/");
}

export function createUploadObjectKey({
  id,
  fileName,
  relativePath,
}: {
  id: string;
  fileName: string;
  relativePath?: string | null;
}) {
  const normalizedFileName = normalizeUploadedFileName(fileName);
  const uniqueFileName = `${id}-${normalizedFileName}`;

  if (!relativePath) {
    return uniqueFileName;
  }

  const normalizedRelativePath = normalizeUploadRelativePath(relativePath);
  const pathSegments = normalizedRelativePath.split("/");
  const relativeFileName = pathSegments.pop();

  if (!relativeFileName || relativeFileName !== fileName) {
    throw new Error("Relative path must end with the file name");
  }

  return [...pathSegments, uniqueFileName].join("/");
}

export function normalizeUploadedContentType(fileName: string, contentType: string) {
  if (/\.app\.zip$/i.test(fileName)) {
    return "application/octet-stream";
  }

  return contentType || "application/octet-stream";
}
