import path from "node:path";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { Embedder } from "@/domain/types";

/** bge models retrieve better when queries (not passages) carry this instruction prefix. */
const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const BATCH_SIZE = 16;

const globalForModel = globalThis as unknown as {
  documindPipelines?: Map<string, Promise<FeatureExtractionPipeline>>;
};

/**
 * Local sentence embeddings via transformers.js (ONNX Runtime, quantised weights), so the app
 * needs no embedding API key. The model downloads once into `cacheDir`, then loads from disk.
 */
export class TransformersEmbedder implements Embedder {
  constructor(
    private readonly model: string,
    private readonly cacheDir: string,
  ) {}

  private pipeline(): Promise<FeatureExtractionPipeline> {
    const pipelines = (globalForModel.documindPipelines ??= new Map());
    let pending = pipelines.get(this.model);
    if (!pending) {
      pending = (async () => {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.cacheDir = path.resolve(this.cacheDir);
        return pipeline("feature-extraction", this.model, { dtype: "q8" });
      })();
      pending.catch(() => pipelines.delete(this.model)); // allow a retry after a failed download
      pipelines.set(this.model, pending);
    }
    return pending;
  }

  private get isBge(): boolean {
    return /bge-/i.test(this.model);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const extractor = await this.pipeline();
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const output = await extractor(texts.slice(i, i + BATCH_SIZE), {
        // bge was trained with CLS pooling; MiniLM-style models use mean pooling.
        pooling: this.isBge ? "cls" : "mean",
        normalize: true,
      });
      vectors.push(...(output.tolist() as number[][]));
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedDocuments([this.isBge ? BGE_QUERY_PREFIX + text : text]);
    return vector!;
  }
}
