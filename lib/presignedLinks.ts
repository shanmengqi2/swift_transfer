import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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

let database: DatabaseSync | undefined;

function getDefaultDatabasePath() {
  if (process.env.VERCEL) {
    return path.join(tmpdir(), "swift-transfer.sqlite");
  }

  return path.join(process.cwd(), ".data", "swift-transfer.sqlite");
}

function getDatabase() {
  if (database) {
    return database;
  }

  const dbPath = process.env.SWIFT_TRANSFER_DB_PATH ?? getDefaultDatabasePath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  database = new DatabaseSync(dbPath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS presigned_links (
      key TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      url TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      expires_in_seconds INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  return database;
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

export function getPresignedLink(key: string) {
  const row = getDatabase()
    .prepare("SELECT * FROM presigned_links WHERE key = ?")
    .get(key) as StoredPresignedLinkRow | undefined;

  return row ? mapRow(row) : null;
}

export function listPresignedLinks(keys: string[]) {
  if (keys.length === 0) {
    return new Map<string, StoredPresignedLink>();
  }

  const links = new Map<string, StoredPresignedLink>();
  const statement = getDatabase().prepare(
    "SELECT * FROM presigned_links WHERE key = ?",
  );

  for (const key of keys) {
    const row = statement.get(key) as StoredPresignedLinkRow | undefined;
    if (row) {
      links.set(key, mapRow(row));
    }
  }

  return links;
}

export function savePresignedLink(link: StoredPresignedLink) {
  getDatabase()
    .prepare(
      `
      INSERT INTO presigned_links (
        key,
        bucket,
        url,
        expires_at,
        expires_in_seconds,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        bucket = excluded.bucket,
        url = excluded.url,
        expires_at = excluded.expires_at,
        expires_in_seconds = excluded.expires_in_seconds,
        created_at = excluded.created_at
    `,
    )
    .run(
      link.key,
      link.bucket,
      link.url,
      link.expiresAt,
      link.expiresInSeconds,
      link.createdAt,
    );
}

export function deletePresignedLink(key: string) {
  getDatabase().prepare("DELETE FROM presigned_links WHERE key = ?").run(key);
}
