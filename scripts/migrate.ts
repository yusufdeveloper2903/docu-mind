import { getPool } from "@/infra/db/pool";
import { migrate } from "@/infra/db/migrate";

const pool = getPool();
const applied = await migrate(pool);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
await pool.end();
