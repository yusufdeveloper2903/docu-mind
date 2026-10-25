import pg from "pg";
import { getConfig } from "@/config";

// Return timestamptz columns as ISO strings so rows serialise the same way they are typed.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());

const globalForPool = globalThis as unknown as { documindPool?: pg.Pool };

/** One pool per process, reused across Next.js hot reloads. */
export function getPool(): pg.Pool {
  globalForPool.documindPool ??= new pg.Pool({
    connectionString: getConfig().DATABASE_URL,
    max: 10,
  });
  return globalForPool.documindPool;
}

export const toVector = (values: number[]): string => `[${values.join(",")}]`;
