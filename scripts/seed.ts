import { getContainer } from "@/container";
import { migrate } from "@/infra/db/migrate";
import { ingestCorpus } from "./corpus";

const container = getContainer();
await migrate(container.pool);
console.log("Ingesting sample corpus (the first run downloads the ~35 MB embedding model)...");
for (const doc of await ingestCorpus(container)) {
  const detail = doc.status === "failed" ? `failed: ${doc.error}` : `${doc.chunkCount} chunks`;
  console.log(`  ${doc.filename.padEnd(32)} ${detail}`);
}
await container.pool.end();
