import pg from "pg";
import { migrate } from "../src/infra/db/migrate";
import { ensureDatabase } from "../scripts/database";

/** A clean, migrated database for every e2e run. */
export default async function globalSetup(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL!; // set in playwright.config.ts
  await ensureDatabase(url);
  const pool = new pg.Pool({ connectionString: url });
  try {
    await migrate(pool);
    await pool.query("TRUNCATE documents, conversations CASCADE");
  } finally {
    await pool.end();
  }
}
