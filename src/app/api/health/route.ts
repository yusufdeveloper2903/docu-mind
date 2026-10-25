import { getContainer } from "@/container";
import { handle } from "@/lib/http";

/** Liveness plus the answer mode, so the UI can explain when live answers are unavailable. */
export const GET = handle(async () => {
  const { pool, config } = getContainer();
  await pool.query("SELECT 1");
  const mode =
    config.LLM_PROVIDER === "mock" ? "mock" : config.ANTHROPIC_API_KEY ? "claude" : "unconfigured";
  return Response.json({ status: "ok", answerMode: mode, model: config.CLAUDE_MODEL });
});
