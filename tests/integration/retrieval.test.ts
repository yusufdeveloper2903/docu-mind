import { beforeAll, describe, expect, it } from "vitest";
import { ingestCorpus } from "../../scripts/corpus";
import { resetDatabase, setupContainer } from "./helpers";

const container = setupContainer();

beforeAll(async () => {
  await resetDatabase(container);
  await ingestCorpus(container);
});

describe("ingestion into Postgres", () => {
  it("stores every corpus document as ready, with chunks, embeddings and a tsvector", async () => {
    const documents = await container.documents.list();
    expect(documents).toHaveLength(4);
    for (const doc of documents) {
      expect(doc).toMatchObject({ status: "ready", error: null });
      expect(doc.chunkCount).toBeGreaterThan(0);
    }
    const { rows } = await container.pool.query<{ dims: number; lexemes: number }>(
      "SELECT vector_dims(embedding) AS dims, length(tsv) AS lexemes FROM chunks LIMIT 1",
    );
    expect(rows[0]).toEqual({ dims: 384, lexemes: expect.any(Number) });
    expect(rows[0]!.lexemes).toBeGreaterThan(0);
  });

  it("re-seeding is idempotent", async () => {
    await ingestCorpus(container);
    expect(await container.documents.list()).toHaveLength(4);
  });
});

describe("hybrid retrieval", () => {
  it("puts the passage that answers the question first", async () => {
    const { sources, weak } = await container.retrieval.search(
      "How many vacation days do full-time employees get?",
    );
    expect(weak).toBe(false);
    expect(sources[0]!.heading).toContain("Vacation");
    expect(sources[0]!.content).toContain("28 days of paid vacation");
    expect(sources.map((s) => s.index)).toEqual(sources.map((_, i) => i + 1));
  });

  it("finds paraphrased questions through the embedding even without shared keywords", async () => {
    const { sources } = await container.retrieval.search(
      "When do new engineers start carrying the pager?",
    );
    expect(sources.slice(0, 3).some((s) => s.content.includes("on-call rotation"))).toBe(true);
  });

  it("lexical search matches on any query term, ranking heading hits higher", async () => {
    const hits = await container.chunks.lexicalSearch("warranty xyzzy", 5);
    expect(hits.length).toBeGreaterThan(0);
    const [top] = await container.chunks.getMany([hits[0]!.id]);
    expect(top!.heading).toContain("warranty");
  });

  it("returns no lexical hits for a query made only of stop words", async () => {
    expect(await container.chunks.lexicalSearch("the and of", 5)).toEqual([]);
  });

  it("flags out-of-scope questions as weak", async () => {
    expect((await container.retrieval.search("Who won the football World Cup in 1998?")).weak).toBe(
      true,
    );
  });

  it("deleting a document removes its chunks from search results", async () => {
    const faq = (await container.documents.list()).find(
      (d) => d.filename === "beacon-product-faq.md",
    )!;
    expect(await container.documents.delete(faq.id)).toBe(true);
    const { rows } = await container.pool.query("SELECT 1 FROM chunks WHERE document_id = $1", [
      faq.id,
    ]);
    expect(rows).toHaveLength(0);
    const { sources } = await container.retrieval.search("How long does the Beacon battery last?");
    expect(sources.every((s) => s.documentId !== faq.id)).toBe(true);
  });
});
