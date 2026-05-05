import { getSql } from "@/lib/postgres";

type StoredPresignedLink = {
  key: string;
  bucket: string;
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
  createdAt: string;
};

type StoredPresignedLinkRow = {
  key: string;
  bucket: string;
  url: string;
  expires_at: string;
  expires_in_seconds: number;
  created_at: string;
};

let initialization: Promise<void> | undefined;

async function ensureSchema() {
  if (!initialization) {
    initialization = getSql()
      .query(`
        CREATE TABLE IF NOT EXISTS presigned_links (
          "key" TEXT PRIMARY KEY,
          bucket TEXT NOT NULL,
          url TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          expires_in_seconds INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
      `)
      .then(() => undefined)
      .catch((error) => {
        initialization = undefined;
        throw error;
      });
  }

  await initialization;
}

function mapRow(row: StoredPresignedLinkRow): StoredPresignedLink {
  return {
    key: row.key,
    bucket: row.bucket,
    url: row.url,
    expiresAt: row.expires_at,
    expiresInSeconds: row.expires_in_seconds,
    createdAt: row.created_at,
  };
}

export async function getPresignedLink(key: string) {
  await ensureSchema();

  const rows = (await getSql().query(
    'SELECT * FROM presigned_links WHERE "key" = $1',
    [key],
  )) as StoredPresignedLinkRow[];
  const row = rows[0];

  return row ? mapRow(row) : null;
}

export async function listPresignedLinks(keys: string[]) {
  if (keys.length === 0) {
    return new Map<string, StoredPresignedLink>();
  }

  await ensureSchema();

  const links = new Map<string, StoredPresignedLink>();
  const rows = (await getSql().query(
    'SELECT * FROM presigned_links WHERE "key" = ANY($1::text[])',
    [keys],
  )) as StoredPresignedLinkRow[];

  for (const row of rows) {
    links.set(row.key, mapRow(row));
  }

  return links;
}

export async function savePresignedLink(link: StoredPresignedLink) {
  await ensureSchema();

  await getSql().query(
    `
      INSERT INTO presigned_links (
        "key",
        bucket,
        url,
        expires_at,
        expires_in_seconds,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT("key") DO UPDATE SET
        bucket = excluded.bucket,
        url = excluded.url,
        expires_at = excluded.expires_at,
        expires_in_seconds = excluded.expires_in_seconds,
        created_at = excluded.created_at
    `,
    [
      link.key,
      link.bucket,
      link.url,
      link.expiresAt,
      link.expiresInSeconds,
      link.createdAt,
    ],
  );
}

export async function deletePresignedLink(key: string) {
  await ensureSchema();

  await getSql().query('DELETE FROM presigned_links WHERE "key" = $1', [key]);
}
