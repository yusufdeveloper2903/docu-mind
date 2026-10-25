import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "@/config";
import { NotConfiguredError } from "@/domain/errors";
import type { AnswerProvider } from "@/domain/types";
import { ChunksRepository } from "@/infra/db/chunks-repo";
import { ConversationsRepository } from "@/infra/db/conversations-repo";
import { DocumentsRepository } from "@/infra/db/documents-repo";
import { getPool } from "@/infra/db/pool";
import { TransformersEmbedder } from "@/infra/embedder";
import { ClaudeAnswerProvider } from "@/infra/llm/claude";
import { MockAnswerProvider } from "@/infra/llm/mock";
import { ChatService } from "@/services/chat";
import { IngestionService } from "@/services/ingestion";
import { RetrievalService } from "@/services/retrieval";

/** Composition root: the only place where concrete infrastructure is chosen and wired. */
function createContainer() {
  const config = getConfig();
  const pool = getPool();
  const documents = new DocumentsRepository(pool);
  const chunks = new ChunksRepository(pool);
  const conversations = new ConversationsRepository(pool);
  const embedder = new TransformersEmbedder(config.EMBEDDING_MODEL, config.MODEL_CACHE_DIR);
  const retrieval = new RetrievalService(chunks, embedder, {
    topK: config.RETRIEVAL_TOP_K,
    minSimilarity: config.RETRIEVAL_MIN_SIMILARITY,
  });

  let provider: AnswerProvider | undefined;
  const answerProvider = (): AnswerProvider => {
    if (provider) return provider;
    if (config.LLM_PROVIDER === "mock") return (provider = new MockAnswerProvider());
    if (!config.ANTHROPIC_API_KEY) {
      throw new NotConfiguredError(
        "Live answers need ANTHROPIC_API_KEY. Set it, or run with LLM_PROVIDER=mock.",
      );
    }
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    return (provider = new ClaudeAnswerProvider(client, {
      model: config.CLAUDE_MODEL,
      effort: config.CLAUDE_EFFORT,
    }));
  };

  return {
    config,
    pool,
    documents,
    chunks,
    embedder,
    ingestion: new IngestionService(documents, embedder),
    retrieval,
    answerProvider,
    chat: () => new ChatService(retrieval, conversations, answerProvider()),
  };
}

export type Container = ReturnType<typeof createContainer>;

const globalForContainer = globalThis as unknown as { documindContainer?: Container };

export function getContainer(): Container {
  globalForContainer.documindContainer ??= createContainer();
  return globalForContainer.documindContainer;
}
