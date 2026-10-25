import pg from "pg";
import { migrate } from "@/infra/db/migrate";
import { ensureDatabase } from "../../scripts/database";

/** Creates and migrates the test database once per run, starting from empty tables. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL!; // set in vitest.config.ts
  await ensureDatabase(url);
  const pool = new pg.Pool({ connectionString: url });
  try {
    await migrate(pool);
    await pool.query("TRUNCATE documents, conversations CASCADE");
  } finally {
    await pool.end();
  }
}
