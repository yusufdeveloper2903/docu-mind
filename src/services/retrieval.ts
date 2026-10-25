import type { Embedder, Source } from "@/domain/types";
import type { ChunksRepository } from "@/infra/db/chunks-repo";
import { reciprocalRankFusion } from "./rrf";

export interface RetrievalOptions {
  topK: number;
  /** Below this best cosine similarity the question is treated as out of scope for the corpus. */
  minSimilarity: number;
  /** How many candidates each retriever contributes before fusion. */
  candidates?: number;
}

export interface RetrievalResult {
  sources: Source[];
  /** Best cosine similarity among vector candidates (0 when the corpus is empty). */
  topSimilarity: number;
  /** True when nothing retrieved is relevant enough to ground an answer. */
  weak: boolean;
}

type ChunkSearch = Pick<ChunksRepository, "lexicalSearch" | "vectorSearch" | "getMany">;

export class RetrievalService {
  constructor(
    private readonly chunks: ChunkSearch,
    private readonly embedder: Embedder,
    private readonly options: RetrievalOptions,
  ) {}

  async search(query: string): Promise<RetrievalResult> {
    const candidates = this.options.candidates ?? 20;
    const embedding = await this.embedder.embedQuery(query);
    const [lexical, semantic] = await Promise.all([
      this.chunks.lexicalSearch(query, candidates),
      this.chunks.vectorSearch(embedding, candidates),
    ]);

    const topSimilarity = semantic[0]?.similarity ?? 0;
    const fused = reciprocalRankFusion([lexical.map((h) => h.id), semantic.map((h) => h.id)]).slice(
      0,
      this.options.topK,
    );
    const byId = new Map((await this.chunks.getMany(fused.map((f) => f.id))).map((c) => [c.id, c]));

    // A chunk can vanish between search and hydration if its document is deleted concurrently.
    const sources = fused
      .flatMap((f) => {
        const chunk = byId.get(f.id);
        return chunk ? [{ ...chunk, score: f.score }] : [];
      })
      .map((s, i) => ({ ...s, index: i + 1 }));
    return {
      sources,
      topSimilarity,
      weak: sources.length === 0 || topSimilarity < this.options.minSimilarity,
    };
  }
}
