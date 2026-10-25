import pg from "pg";

/** The same server and credentials as `url`, but a different database name. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Creates the database in `url` if it does not exist yet, by connecting to the server's
 * `postgres` maintenance database. Used to give tests and evals an isolated database.
 */
export async function ensureDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1);
  const admin = new pg.Client({ connectionString: withDatabase(url, "postgres") });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
  } finally {
    await admin.end();
  }
}
