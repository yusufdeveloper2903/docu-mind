import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  AnswerProviderError,
  buildRequest,
  ClaudeAnswerProvider,
  sourceUri,
  SYSTEM_PROMPT,
  toCitation,
  toSearchResult,
} from "@/infra/llm/claude";
import { collect, makeSource } from "./fixtures";

const options = { model: "claude-opus-5-5", effort: "low" as const };
const sources = [makeSource(1), makeSource(2, { heading: null })];

function searchCitation(
  index: number,
  source: string,
  citedText = "quoted",
): Anthropic.TextCitation {
  return {
    type: "search_result_location",
    search_result_index: index,
    source,
    title: null,
    cited_text: citedText,
    start_block_index: 0,
    end_block_index: 1,
  };
}

describe("buildRequest", () => {
  const request = buildRequest(
    {
      question: "How many vacation days?",
      history: [
        { role: "assistant", content: "orphan greeting" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
      sources,
    },
    options,
  );

  it("uses adaptive thinking, explicit effort and a cached system prompt", () => {
    expect(request).toMatchObject({
      model: "claude-opus-5-5",
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    });
  });

  it("keeps the system prompt free of per-request data so the cache prefix is stable", () => {
    const other = buildRequest(
      { question: "Battery life?", history: [], sources: [makeSource(3)] },
      options,
    );
    expect(other.system).toEqual(request.system);
    expect(other.thinking).toEqual(request.thinking);
    expect(other.output_config).toEqual(request.output_config);
  });

  it("drops history before the first user turn and puts sources before the question", () => {
    expect(request.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const last = request.messages.at(-1)!.content as Anthropic.ContentBlockParam[];
    expect(last.map((b) => b.type)).toEqual(["search_result", "search_result", "text"]);
    expect(last.at(-1)).toEqual({ type: "text", text: "How many vacation days?" });
  });
});

describe("toSearchResult", () => {
  it("enables citations and splits paragraphs into separate text blocks", () => {
    expect(toSearchResult(sources[0]!)).toEqual({
      type: "search_result",
      source: sourceUri(sources[0]!.id),
      title: "Employee Handbook › Leave › Vacation",
      content: [
        { type: "text", text: "Passage 1 first paragraph." },
        { type: "text", text: "Passage 1 second paragraph." },
      ],
      citations: { enabled: true },
    });
  });

  it("titles a chunk without a heading by its document", () => {
    expect(toSearchResult(sources[1]!).title).toBe("Employee Handbook");
  });
});

describe("toCitation", () => {
  it("maps search_result_index to the numbered source", () => {
    expect(toCitation(searchCitation(1, sourceUri(sources[1]!.id), "28 days"), sources)).toEqual({
      source: 2,
      chunkId: sources[1]!.id,
      citedText: "28 days",
    });
  });

  it("falls back to the source URI when the index does not match", () => {
    expect(toCitation(searchCitation(0, sourceUri(sources[1]!.id)), sources)?.source).toBe(2);
  });

  it("rejects citations that point at no retrieved source or are not search results", () => {
    expect(toCitation(searchCitation(5, "documind://chunks/unknown"), sources)).toBeNull();
    const charLocation: Anthropic.TextCitation = {
      type: "char_location",
      cited_text: "x",
      document_index: 0,
      document_title: null,
      file_id: null,
      start_char_index: 0,
      end_char_index: 1,
    };
    expect(toCitation(charLocation, sources)).toBeNull();
  });
});

/** A stand-in for `client.messages.stream()` that replays raw stream events. */
function fakeClient(events: unknown[], stopReason: Anthropic.StopReason, error?: Error) {
  const stream = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
      if (error) throw error;
    },
    finalMessage: async () => ({ stop_reason: stopReason, stop_details: null }),
  }));
  return { client: { messages: { stream } } as unknown as Anthropic, stream };
}

const request = { question: "How many vacation days?", history: [], sources };

describe("ClaudeAnswerProvider", () => {
  it("streams text and API citations per text block, skipping thinking blocks", async () => {
    const { client } = fakeClient(
      [
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "hm" },
        },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "You get " } },
        { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "28 days." } },
        {
          type: "content_block_delta",
          index: 2,
          delta: {
            type: "citations_delta",
            citation: searchCitation(0, sourceUri(sources[0]!.id)),
          },
        },
      ],
      "end_turn",
    );

    const events = await collect(new ClaudeAnswerProvider(client, options).stream(request));
    expect(events).toEqual([
      { type: "text", segment: 0, text: "You get " },
      { type: "text", segment: 1, text: "28 days." },
      {
        type: "citation",
        segment: 1,
        citation: { source: 1, chunkId: sources[0]!.id, citedText: "quoted" },
      },
      { type: "end", stopReason: "end_turn" },
    ]);
  });

  it("passes the abort signal to the SDK", async () => {
    const { client, stream } = fakeClient([], "end_turn");
    const controller = new AbortController();
    await collect(new ClaudeAnswerProvider(client, options).stream(request, controller.signal));
    expect(stream).toHaveBeenCalledWith(expect.any(Object), { signal: controller.signal });
  });

  it("reports a refusal through the stop reason", async () => {
    const { client } = fakeClient([], "refusal");
    const events = await collect(new ClaudeAnswerProvider(client, options).stream(request));
    expect(events.at(-1)).toEqual({ type: "end", stopReason: "refusal" });
  });

  it("turns typed SDK errors into readable provider errors", async () => {
    const authError = new Anthropic.AuthenticationError(
      401,
      {},
      "invalid x-api-key",
      new Headers(),
    );
    const { client } = fakeClient([], "end_turn", authError);
    await expect(
      collect(new ClaudeAnswerProvider(client, options).stream(request)),
    ).rejects.toThrow(
      new AnswerProviderError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."),
    );
  });

  it("lets user aborts propagate unchanged", async () => {
    const abort = new Anthropic.APIUserAbortError();
    const { client } = fakeClient([], "end_turn", abort);
    await expect(collect(new ClaudeAnswerProvider(client, options).stream(request))).rejects.toBe(
      abort,
    );
  });
});
