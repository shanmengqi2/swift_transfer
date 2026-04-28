const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FILE_SIZE_MB = 50;

export type UploadLimits = {
  maxFiles: number;
  maxFileSizeMb: number;
  maxFileSizeBytes: number;
};

function getPositiveIntegerEnv(names: string[], fallback: number) {
  for (const name of names) {
    const value = process.env[name];
    if (!value) {
      continue;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

export function getUploadLimits(): UploadLimits {
  const maxFiles = getPositiveIntegerEnv(
    ["UPLOAD_MAX_FILES", "NEXT_PUBLIC_MAX_FILES"],
    DEFAULT_MAX_FILES,
  );
  const maxFileSizeMb = getPositiveIntegerEnv(
    ["UPLOAD_MAX_FILE_SIZE_MB", "NEXT_PUBLIC_MAX_FILE_SIZE_MB"],
    DEFAULT_MAX_FILE_SIZE_MB,
  );

  return {
    maxFiles,
    maxFileSizeMb,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
  };
}
