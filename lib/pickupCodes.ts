import { randomBytes, randomInt } from "node:crypto";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { displayFileName, getBucketName, type ManagedFile } from "@/lib/files";
import { getSql } from "@/lib/postgres";
import { getS3Client } from "@/lib/s3Client";

const PICKUP_CODE_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const PICKUP_CODE_LENGTH = 6;

export type PickupFileInput = {
  key: string;
  bucket?: string;
  fileName?: string;
  size?: number;
};

export type PickupCode = {
  id: string;
  code: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type PickupFile = {
  key: string;
  bucket: string;
  fileName: string;
  size: number | null;
};

export type PickupShare = {
  id: string;
  code: string;
  expiresAt: string | null;
  createdAt: string;
  files: PickupFile[];
};

export type PickupFileLink = PickupFile & {
  exists: boolean;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
};

export type PickupCodeListItem = PickupCode & {
  fileCount: number;
  totalSize: number | null;
  missingFileCount: number;
  filePreview: PickupFile[];
};

type PickupCodeRow = {
  id: string;
  code: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

type PickupFileRow = {
  key: string;
  bucket: string;
  file_name: string;
  size: number | null;
};

type PickupCodeListRow = PickupCodeRow & {
  file_count: number;
  total_size: number | null;
};

let initialization: Promise<void> | undefined;

async function ensureSchema() {
  if (!initialization) {
    initialization = (async () => {
      await getSql().query(`
        CREATE TABLE IF NOT EXISTS pickup_codes (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revoked_at TEXT
        );
      `);
      await getSql().query(`
        ALTER TABLE pickup_codes
        ADD COLUMN IF NOT EXISTS updated_at TEXT;
      `);
      await getSql().query(`
        ALTER TABLE pickup_codes
        ADD COLUMN IF NOT EXISTS revoked_at TEXT;
      `);
      await getSql().query(`
        UPDATE pickup_codes
        SET updated_at = created_at
        WHERE updated_at IS NULL;
      `);
      await getSql().query(`
        ALTER TABLE pickup_codes
        ALTER COLUMN updated_at SET NOT NULL;
      `);
      await getSql().query(`
        CREATE TABLE IF NOT EXISTS pickup_code_files (
          pickup_code_id TEXT NOT NULL REFERENCES pickup_codes(id) ON DELETE CASCADE,
          "key" TEXT NOT NULL,
          bucket TEXT NOT NULL,
          file_name TEXT NOT NULL,
          size BIGINT,
          added_at TEXT NOT NULL,
          PRIMARY KEY (pickup_code_id, "key")
        );
      `);
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }

  await initialization;
}

function generatePickupCode() {
  let code = "";

  for (let index = 0; index < PICKUP_CODE_LENGTH; index += 1) {
    code += PICKUP_CODE_ALPHABET[randomInt(PICKUP_CODE_ALPHABET.length)];
  }

  return code;
}

function mapPickupCodeRow(row: PickupCodeRow): PickupCode {
  return {
    id: row.id,
    code: row.code,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  };
}

function mapPickupFileRow(row: PickupFileRow): PickupFile {
  return {
    key: row.key,
    bucket: row.bucket,
    fileName: row.file_name,
    size: row.size === null ? null : Number(row.size),
  };
}

export function isPickupCodeExpired(expiresAt: string | null) {
  return expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
}

export function isPickupCodeRevoked(revokedAt: string | null) {
  return Boolean(revokedAt);
}

export async function createPickupCode({
  files,
  expiresAt,
}: {
  files: PickupFileInput[];
  expiresAt: string | null;
}) {
  await ensureSchema();

  const bucket = getBucketName();
  const id = randomBytes(16).toString("hex");
  const createdAt = new Date().toISOString();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generatePickupCode();

    try {
      await getSql().query(
        `
          INSERT INTO pickup_codes (
            id,
            code,
            expires_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $4)
        `,
        [id, code, expiresAt, createdAt],
      );

      await getSql().query(
        `
          INSERT INTO pickup_code_files (
            pickup_code_id,
            "key",
            bucket,
            file_name,
            size,
            added_at
          )
          SELECT
            $1,
            file_rows.key,
            file_rows.bucket,
            file_rows.file_name,
            file_rows.size,
            $2
          FROM jsonb_to_recordset($3::jsonb) AS file_rows(
            key TEXT,
            bucket TEXT,
            file_name TEXT,
            size BIGINT
          )
        `,
        [
          id,
          createdAt,
          JSON.stringify(
            files.map((file) => ({
              key: file.key,
              bucket: file.bucket ?? bucket,
              file_name: file.fileName ?? displayFileName(file.key),
              size: file.size ?? null,
            })),
          ),
        ],
      );

      return {
        id,
        code,
        expiresAt,
        createdAt,
        files,
      };
    } catch (error) {
      const maybePgError = error as { code?: string };
      if (maybePgError.code === "23505" && attempt < 9) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to generate unique pickup code");
}

export async function getPickupShareByCode(code: string) {
  await ensureSchema();

  const codes = (await getSql().query(
    "SELECT * FROM pickup_codes WHERE code = $1",
    [code],
  )) as PickupCodeRow[];
  const codeRow = codes[0];

  if (!codeRow) {
    return null;
  }

  const files = (await getSql().query(
    `
      SELECT "key", bucket, file_name, size
      FROM pickup_code_files
      WHERE pickup_code_id = $1
      ORDER BY added_at ASC, file_name ASC
    `,
    [codeRow.id],
  )) as PickupFileRow[];

  return {
    ...mapPickupCodeRow(codeRow),
    files: files.map(mapPickupFileRow),
  };
}

export async function getPickupCodeById(id: string) {
  await ensureSchema();

  const codes = (await getSql().query(
    "SELECT * FROM pickup_codes WHERE id = $1",
    [id],
  )) as PickupCodeRow[];
  const codeRow = codes[0];

  if (!codeRow) {
    return null;
  }

  const files = (await getSql().query(
    `
      SELECT "key", bucket, file_name, size
      FROM pickup_code_files
      WHERE pickup_code_id = $1
      ORDER BY added_at ASC, file_name ASC
    `,
    [codeRow.id],
  )) as PickupFileRow[];
  const existingObjectKeys = await listExistingObjectKeys();

  return {
    ...mapPickupCodeRow(codeRow),
    files: files.map((file) => ({
      ...mapPickupFileRow(file),
      exists: existingObjectKeys.has(file.key),
    })),
  };
}

export async function updatePickupCodeExpiration({
  id,
  expiresAt,
}: {
  id: string;
  expiresAt: string | null;
}) {
  await ensureSchema();

  const rows = (await getSql().query(
    `
      UPDATE pickup_codes
      SET expires_at = $2, updated_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [id, expiresAt, new Date().toISOString()],
  )) as PickupCodeRow[];

  return rows[0] ? mapPickupCodeRow(rows[0]) : null;
}

export async function revokePickupCode(id: string) {
  await ensureSchema();

  const now = new Date().toISOString();
  const rows = (await getSql().query(
    `
      UPDATE pickup_codes
      SET revoked_at = COALESCE(revoked_at, $2), updated_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [id, now],
  )) as PickupCodeRow[];

  return rows[0] ? mapPickupCodeRow(rows[0]) : null;
}

async function listExistingObjectKeys() {
  const bucket = getBucketName();
  const keys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const response = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (object.Key) {
        keys.add(object.Key);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

export async function listPickupCodes() {
  await ensureSchema();

  const [rawCodeRows, rawFileRows, existingObjectKeys] = await Promise.all([
    getSql().query(
      `
        SELECT
          pc.id,
          pc.code,
          pc.expires_at,
          pc.created_at,
          pc.updated_at,
          pc.revoked_at,
          COUNT(pcf."key")::int AS file_count,
          SUM(pcf.size)::bigint AS total_size
        FROM pickup_codes pc
        LEFT JOIN pickup_code_files pcf ON pcf.pickup_code_id = pc.id
        GROUP BY pc.id, pc.code, pc.expires_at, pc.created_at, pc.updated_at, pc.revoked_at
        ORDER BY pc.created_at DESC
      `,
    ),
    getSql().query(
      `
        SELECT pickup_code_id, "key", bucket, file_name, size
        FROM pickup_code_files
        ORDER BY added_at ASC, file_name ASC
      `,
    ),
    listExistingObjectKeys(),
  ]);
  const codeRows = rawCodeRows as PickupCodeListRow[];
  const fileRows = rawFileRows as (PickupFileRow & { pickup_code_id: string })[];
  const filesByCode = new Map<string, PickupFile[]>();
  const missingCountsByCode = new Map<string, number>();

  for (const row of fileRows) {
    const file = mapPickupFileRow(row);
    const files = filesByCode.get(row.pickup_code_id) ?? [];
    files.push(file);
    filesByCode.set(row.pickup_code_id, files);

    if (!existingObjectKeys.has(row.key)) {
      missingCountsByCode.set(
        row.pickup_code_id,
        (missingCountsByCode.get(row.pickup_code_id) ?? 0) + 1,
      );
    }
  }

  return codeRows.map((row) => ({
    ...mapPickupCodeRow(row),
    fileCount: Number(row.file_count),
    totalSize: row.total_size === null ? null : Number(row.total_size),
    missingFileCount: missingCountsByCode.get(row.id) ?? 0,
    filePreview: (filesByCode.get(row.id) ?? []).slice(0, 3),
  }));
}

export async function listPickupFileUsage(keys: string[]) {
  if (keys.length === 0) {
    return new Map<string, number>();
  }

  await ensureSchema();

  const rows = (await getSql().query(
    `
      SELECT "key", COUNT(DISTINCT pickup_code_id)::int AS pickup_code_count
      FROM pickup_code_files
      WHERE "key" = ANY($1::text[])
      GROUP BY "key"
    `,
    [keys],
  )) as { key: string; pickup_code_count: number }[];

  return new Map(
    rows.map((row) => [row.key, Number(row.pickup_code_count)]),
  );
}

export async function attachPickupMetadata(files: ManagedFile[]) {
  const pickupUsage = await listPickupFileUsage(files.map((file) => file.key));

  return files.map((file) => ({
    ...file,
    pickupCodeCount: pickupUsage.get(file.key) ?? 0,
  }));
}
