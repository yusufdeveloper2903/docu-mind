import type { AnswerEvent, AnswerSegment } from "./types";

/** The exact sentence used when the corpus cannot answer a question (also asked of Claude). */
export const NO_ANSWER = "I couldn't find an answer to that in your documents.";

export const REFUSAL_NOTICE = "Claude declined to answer this request.";

/**
 * Folds a streamed answer event into the list of segments. Shared by the server (to persist the
 * answer) and the browser (to render it while it streams), so both always agree on the result.
 */
export function applyAnswerEvent(segments: AnswerSegment[], event: AnswerEvent): AnswerSegment[] {
  if (event.type === "end") return segments;
  const next = [...segments];
  const current = next[event.segment] ?? { text: "", citations: [] };
  next[event.segment] =
    event.type === "text"
      ? { ...current, text: current.text + event.text }
      : { ...current, citations: [...current.citations, event.citation] };
  // Fill gaps so the array is never sparse, whatever order segments start in.
  for (let i = 0; i < next.length; i++) next[i] ??= { text: "", citations: [] };
  return next;
}

export const segmentsToText = (segments: AnswerSegment[]): string =>
  segments.map((s) => s.text).join("");
