import { NO_ANSWER } from "@/domain/answer";
import type { AnswerEvent, AnswerProvider, AnswerRequest } from "@/domain/types";
import { splitSentences } from "@/services/chunker";

/**
 * Deterministic stand-in for Claude (LLM_PROVIDER=mock): quotes the first sentence of the
 * best-ranked source and cites it. Used by the e2e test and for demos without an API key.
 */
export class MockAnswerProvider implements AnswerProvider {
  async *stream({ sources }: AnswerRequest): AsyncIterable<AnswerEvent> {
    const top = sources[0];
    if (!top) {
      yield { type: "text", segment: 0, text: NO_ANSWER };
      yield { type: "end", stopReason: "end_turn" };
      return;
    }
    const paragraph = top.content.split(/\n\s*\n/)[0] ?? top.content;
    const sentence = splitSentences(paragraph)[0] ?? paragraph;
    yield { type: "text", segment: 0, text: `From "${top.documentTitle}": ` };
    for (const word of sentence.split(/(?<=\s)/)) {
      yield { type: "text", segment: 1, text: word };
    }
    yield {
      type: "citation",
      segment: 1,
      citation: { source: top.index, chunkId: top.id, citedText: paragraph },
    };
    yield { type: "end", stopReason: "end_turn" };
  }
}
