import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

/**
 * Applies every `db/migrations/*.sql` file that has not run yet, in filename order.
 * Each file runs in its own transaction together with its bookkeeping row, and an advisory
 * lock keeps two processes (e.g. parallel test workers) from migrating at the same time.
 */
export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7461001)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const pending = (await readdir(dir)).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();

    for (const name of pending) {
      const sql = await readFile(path.join(dir, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
      }
    }
    return pending;
  } finally {
    await client.query("SELECT pg_advisory_unlock(7461001)").catch(() => undefined);
    client.release();
  }
}
