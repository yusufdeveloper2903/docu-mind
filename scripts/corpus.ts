import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Container } from "@/container";
import type { DocumentRecord } from "@/domain/types";

export const CORPUS_DIR = path.resolve(process.cwd(), "evals/corpus");

/** Ingests every file in `dir`, skipping files that are already ingested (idempotent seed). */
export async function ingestCorpus(container: Container, dir = CORPUS_DIR): Promise<DocumentRecord[]> {
  const results: DocumentRecord[] = [];
  for (const name of (await readdir(dir)).sort()) {
    const existing = await container.documents.findReadyByFilename(name);
    if (existing) {
      results.push(existing);
      continue;
    }
    const bytes = new Uint8Array(await readFile(path.join(dir, name)));
    results.push(await container.ingestion.ingest({ name, bytes }));
  }
  return results;
}
