import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | undefined;

export function getSql() {
  if (sql) {
    return sql;
  }

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("Missing POSTGRES_URL");
  }

  sql = neon(connectionString);

  return sql;
}
