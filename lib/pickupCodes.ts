import { randomBytes, randomInt } from "node:crypto";
import { displayFileName, getBucketName, type ManagedFile } from "@/lib/files";
import { getSql } from "@/lib/postgres";

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

type PickupCodeRow = {
  id: string;
  code: string;
  expires_at: string | null;
  created_at: string;
};

type PickupFileRow = {
  key: string;
  bucket: string;
  file_name: string;
  size: number | null;
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
          created_at TEXT NOT NULL
        );
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
          INSERT INTO pickup_codes (id, code, expires_at, created_at)
          VALUES ($1, $2, $3, $4)
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
