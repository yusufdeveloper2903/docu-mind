import { describe, expect, it, vi } from "vitest";
import type { Chunk, Embedder } from "@/domain/types";
import { RetrievalService } from "@/services/retrieval";

const chunk = (id: string): Chunk => ({
  id,
  documentId: "doc",
  documentTitle: "Doc",
  ordinal: 0,
  heading: null,
  content: `content of ${id}`,
});

const embedder: Embedder = {
  embedDocuments: async (texts) => texts.map(() => [1, 0]),
  embedQuery: vi.fn(async () => [1, 0]),
};

function service(lexical: string[], vector: [string, number][], topK = 3) {
  const repo = {
    lexicalSearch: vi.fn(async () => lexical.map((id, i) => ({ id, rank: 1 / (i + 1) }))),
    vectorSearch: vi.fn(async () => vector.map(([id, similarity]) => ({ id, similarity }))),
    // Hydration may return rows in any order and drop deleted chunks.
    getMany: vi.fn(async (ids: string[]) =>
      ids
        .filter((id) => id !== "deleted")
        .reverse()
        .map(chunk),
    ),
  };
  return { retrieval: new RetrievalService(repo, embedder, { topK, minSimilarity: 0.5 }), repo };
}

describe("RetrievalService", () => {
  it("fuses lexical and vector rankings and numbers the sources from 1", async () => {
    const { retrieval } = service(
      ["a", "b"],
      [
        ["b", 0.9],
        ["c", 0.8],
      ],
    );
    const { sources, weak, topSimilarity } = await retrieval.search("question");

    expect(sources.map((s) => [s.index, s.id])).toEqual([
      [1, "b"],
      [2, "a"],
      [3, "c"],
    ]);
    expect(sources[0]!.score).toBeGreaterThan(sources[1]!.score);
    expect(topSimilarity).toBe(0.9);
    expect(weak).toBe(false);
  });

  it("keeps only the top K fused results", async () => {
    const { retrieval } = service(["a", "b", "c", "d"], [], 2);
    expect((await retrieval.search("q")).sources.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("flags retrieval as weak when the best semantic match is below the threshold", async () => {
    const { retrieval } = service(["a"], [["a", 0.3]]);
    expect(await retrieval.search("off-topic")).toMatchObject({ weak: true, topSimilarity: 0.3 });
  });

  it("flags an empty corpus as weak", async () => {
    const { retrieval } = service([], []);
    expect(await retrieval.search("q")).toEqual({ sources: [], topSimilarity: 0, weak: true });
  });

  it("skips chunks deleted between search and hydration without leaving gaps in numbering", async () => {
    const { retrieval } = service(["deleted", "a"], [["a", 0.9]]);
    expect((await retrieval.search("q")).sources.map((s) => [s.index, s.id])).toEqual([[1, "a"]]);
  });
});
