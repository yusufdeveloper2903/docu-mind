import { describe, expect, it, vi } from "vitest";
import { NO_ANSWER, REFUSAL_NOTICE } from "@/domain/answer";
import { NotFoundError } from "@/domain/errors";
import type { AnswerEvent, AnswerProvider } from "@/domain/types";
import { ChatService } from "@/services/chat";
import type { RetrievalResult } from "@/services/retrieval";
import { collect, makeSource } from "./fixtures";

const CONVERSATION = "20000000-0000-4000-8000-000000000000";

function setup(retrieval: Partial<RetrievalResult>, events: AnswerEvent[] | Error = []) {
  const conversations = {
    create: vi.fn(async () => CONVERSATION),
    exists: vi.fn(async () => true),
    addMessage: vi.fn(async () => undefined),
    recentTurns: vi.fn(async () => [{ role: "user" as const, content: "earlier" }]),
  };
  const provider: AnswerProvider = {
    stream: vi.fn(async function* () {
      if (events instanceof Error) throw events;
      yield* events;
    }),
  };
  const search = vi.fn(async () => ({
    sources: [],
    topSimilarity: 0.8,
    weak: false,
    ...retrieval,
  }));
  return { service: new ChatService({ search }, conversations, provider), conversations, provider };
}

describe("ChatService", () => {
  it("streams the answer after a start event and persists both turns", async () => {
    const sources = [makeSource(1)];
    const citation = { source: 1, chunkId: sources[0]!.id, citedText: "28 days" };
    const { service, conversations, provider } = setup({ sources }, [
      { type: "text", segment: 0, text: "28 days." },
      { type: "citation", segment: 0, citation },
      { type: "end", stopReason: "end_turn" },
    ]);

    const events = await collect(await service.ask({ question: "Vacation?" }));

    expect(events[0]).toMatchObject({ type: "start", conversationId: CONVERSATION });
    expect(events[0]).toHaveProperty("sources.0.chunkId", sources[0]!.id);
    expect(provider.stream).toHaveBeenCalledWith(
      { question: "Vacation?", history: [{ role: "user", content: "earlier" }], sources },
      undefined,
    );
    expect(conversations.addMessage).toHaveBeenNthCalledWith(1, CONVERSATION, "user", "Vacation?");
    expect(conversations.addMessage).toHaveBeenNthCalledWith(
      2,
      CONVERSATION,
      "assistant",
      "28 days.",
      [{ text: "28 days.", citations: [citation] }],
    );
  });

  it("answers 'not found' without calling the model when retrieval is weak", async () => {
    const { service, provider, conversations } = setup({ sources: [makeSource(1)], weak: true });

    const events = await collect(await service.ask({ question: "Weather in Paris?" }));

    expect(provider.stream).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: "start", conversationId: CONVERSATION, sources: [] },
      { type: "text", segment: 0, text: NO_ANSWER },
      { type: "end", stopReason: "no_context" },
    ]);
    expect(conversations.addMessage).toHaveBeenLastCalledWith(
      CONVERSATION,
      "assistant",
      NO_ANSWER,
      [{ text: NO_ANSWER, citations: [] }],
    );
  });

  it("stores a notice instead of a partial answer when the model refuses", async () => {
    const { service, conversations } = setup({ sources: [makeSource(1)] }, [
      { type: "text", segment: 0, text: "Partial" },
      { type: "end", stopReason: "refusal" },
    ]);
    await collect(await service.ask({ question: "?" }));
    expect(conversations.addMessage).toHaveBeenLastCalledWith(
      CONVERSATION,
      "assistant",
      REFUSAL_NOTICE,
      [{ text: REFUSAL_NOTICE, citations: [] }],
    );
  });

  it("reports provider failures as an error event and saves nothing", async () => {
    const { service, conversations } = setup(
      { sources: [makeSource(1)] },
      new Error("Claude is down"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const events = await collect(await service.ask({ question: "?" }));

    expect(events.at(-1)).toEqual({ type: "error", message: "Claude is down" });
    expect(conversations.addMessage).toHaveBeenCalledTimes(1); // only the question
  });

  it("rejects an unknown conversation before streaming", async () => {
    const { service, conversations } = setup({});
    conversations.exists.mockResolvedValue(false);
    await expect(
      service.ask({ question: "?", conversationId: CONVERSATION }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });
});
