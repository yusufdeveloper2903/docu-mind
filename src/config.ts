import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_DATABASE_URL = "postgres://localhost:5432/documind";

const schema = z.object({
  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().min(1).default("claude-opus-5-5"),
  CLAUDE_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  EMBEDDING_MODEL: z.string().min(1).default("Xenova/bge-small-en-v1.5"),
  MODEL_CACHE_DIR: z.string().default(".cache/models"),
  RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
  RETRIEVAL_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.5),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
});

export type Config = z.infer<typeof schema>;

/**
 * Loads the Anthropic key from a dotenv file that lives outside the repository, so the key
 * never has to be copied into the project. Variables already set in the environment win.
 */
function loadExternalKeyFile(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  // A runtime-only path: tell Turbopack not to trace (and bundle) the filesystem around it.
  const file = path.resolve(
    /* turbopackIgnore: true */ process.env.ANTHROPIC_ENV_FILE ?? "../.anthropic.env",
  );
  if (existsSync(file)) process.loadEnvFile(file);
}

let cached: Config | undefined;

export function getConfig(): Config {
  if (!cached) {
    loadExternalKeyFile();
    // Empty strings (e.g. `ANTHROPIC_API_KEY=` from .env.example) mean "unset".
    const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    cached = schema.parse(env);
  }
  return cached;
}
