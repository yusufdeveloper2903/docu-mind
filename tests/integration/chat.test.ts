import { beforeAll, describe, expect, it } from "vitest";
import { POST as chat } from "@/app/api/chat/route";
import { GET as getChunk } from "@/app/api/chunks/[id]/route";
import type { ChatEvent } from "@/domain/types";
import { migrate } from "@/infra/db/migrate";
import { ingestCorpus } from "../../scripts/corpus";
import { resetDatabase, setupContainer } from "./helpers";

const container = setupContainer();

beforeAll(async () => {
  await resetDatabase(container);
  await ingestCorpus(container);
});

async function ask(question: string, conversationId?: string): Promise<ChatEvent[]> {
  const response = await chat(
    new Request("http://test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, conversationId }),
    }),
  );
  expect(response.status).toBe(200);
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("POST /api/chat against Postgres (mock answer provider)", () => {
  it("streams a cited answer whose citation resolves to the stored passage", async () => {
    const events = await ask("How many vacation days do full-time employees get?");
    const start = events[0] as Extract<ChatEvent, { type: "start" }>;
    const citation = events.find((e) => e.type === "citation");

    expect(start.type).toBe("start");
    expect(citation).toBeDefined();
    expect(events.at(-1)).toEqual({ type: "end", stopReason: "end_turn" });

    const chunkId = (citation as Extract<ChatEvent, { type: "citation" }>).citation.chunkId;
    const passage = await getChunk(new Request("http://test"), {
      params: Promise.resolve({ id: chunkId }),
    });
    expect((await passage.json()).content).toContain("28 days of paid vacation");
  });

  it("persists the conversation and sends earlier turns with a follow-up", async () => {
    const first = await ask("What does Beacon measure?");
    const { conversationId } = first[0] as Extract<ChatEvent, { type: "start" }>;
    await ask("And how accurate is the CO2 sensor?", conversationId);

    const { rows } = await container.pool.query(
      "SELECT role, segments FROM messages WHERE conversation_id = $1 ORDER BY created_at, id",
      [conversationId],
    );
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(rows[1].segments.some((s: { citations: unknown[] }) => s.citations.length > 0)).toBe(
      true,
    );
  });

  it("returns 404 for a conversation that does not exist", async () => {
    const response = await chat(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          question: "Hi",
          conversationId: "40000000-0000-4000-8000-000000000000",
        }),
      }),
    );
    expect(response.status).toBe(404);
  });
});

describe("migrations", () => {
  it("are recorded and not re-applied", async () => {
    expect(await migrate(container.pool)).toEqual([]);
    const { rows } = await container.pool.query("SELECT name FROM schema_migrations");
    expect(rows.map((r) => r.name)).toContain("001_init.sql");
  });
});
