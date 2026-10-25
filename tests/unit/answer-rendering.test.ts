import { describe, expect, it } from "vitest";
import { applyAnswerEvent, segmentsToText } from "@/domain/answer";
import type { AnswerEvent, AnswerSegment } from "@/domain/types";
import { citedSources, locateQuote } from "@/lib/highlight";
import { readNdjson } from "@/lib/ndjson";
import { collect } from "./fixtures";

describe("applyAnswerEvent", () => {
  const citation = { source: 2, chunkId: "c2", citedText: "28 days" };

  it("appends text and citations to the addressed segment", () => {
    const events: AnswerEvent[] = [
      { type: "text", segment: 0, text: "You get " },
      { type: "text", segment: 1, text: "28 " },
      { type: "text", segment: 1, text: "days." },
      { type: "citation", segment: 1, citation },
      { type: "end", stopReason: "end_turn" },
    ];
    const segments = events.reduce<AnswerSegment[]>(applyAnswerEvent, []);
    expect(segments).toEqual([
      { text: "You get ", citations: [] },
      { text: "28 days.", citations: [citation] },
    ]);
    expect(segmentsToText(segments)).toBe("You get 28 days.");
  });

  it("never leaves holes when a later segment arrives first", () => {
    const segments = applyAnswerEvent([], { type: "text", segment: 2, text: "x" });
    expect(segments).toEqual([
      { text: "", citations: [] },
      { text: "", citations: [] },
      { text: "x", citations: [] },
    ]);
  });

  it("does not mutate the previous state", () => {
    const before: AnswerSegment[] = [{ text: "a", citations: [] }];
    applyAnswerEvent(before, { type: "text", segment: 0, text: "b" });
    expect(before).toEqual([{ text: "a", citations: [] }]);
  });
});

describe("locateQuote", () => {
  it("finds the cited text even when whitespace differs", () => {
    expect(
      locateQuote("Intro. Full-time employees\nget 28 days. Outro.", "employees get  28 days."),
    ).toEqual({
      before: "Intro. Full-time ",
      match: "employees\nget 28 days.",
      after: " Outro.",
    });
  });

  it("treats regex characters in the quote literally and returns null when absent", () => {
    expect(locateQuote("Costs (4 EUR) per month", "(4 EUR)")?.match).toBe("(4 EUR)");
    expect(locateQuote("Something else", "28 days")).toBeNull();
    expect(locateQuote("Anything", "  ")).toBeNull();
  });
});

describe("citedSources", () => {
  it("keeps the first citation per source in order", () => {
    const cites = [{ source: 2 }, { source: 1 }, { source: 2 }];
    expect(citedSources(cites)).toEqual([{ source: 2 }, { source: 1 }]);
  });
});

describe("readNdjson", () => {
  it("reassembles lines split across chunks, including multi-byte characters", async () => {
    const bytes = new TextEncoder().encode('{"a":"héllo"}\n{"b":2}\n{"c":3}');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const cut of [
          [0, 9],
          [9, 17],
          [17, bytes.length],
        ]) {
          controller.enqueue(bytes.slice(cut[0], cut[1]));
        }
        controller.close();
      },
    });
    expect(await collect(readNdjson(stream))).toEqual([{ a: "héllo" }, { b: 2 }, { c: 3 }]);
  });
});
