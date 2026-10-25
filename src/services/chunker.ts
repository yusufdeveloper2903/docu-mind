import type { ChunkDraft, DocumentFormat } from "@/domain/types";

export interface ChunkOptions {
  /** Soft upper bound for a chunk's body. Only the overlap carried in can push a chunk past it. */
  maxChars: number;
  /** How much trailing text of the previous chunk (whole sentences) is repeated at the start of the next. */
  overlapChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { maxChars: 1000, overlapChars: 200 };

interface Section {
  heading: string | null;
  body: string;
}

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/**
 * Splits a document into retrieval units. Markdown is first cut at headings so a chunk never
 * straddles two sections, and each chunk remembers its heading path ("Leave › Vacation").
 * Inside a section, whole paragraphs are packed greedily; oversized paragraphs fall back to
 * sentences, and consecutive chunks share a sentence-aligned overlap.
 */
export function chunkDocument(
  text: string,
  format: DocumentFormat,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): ChunkDraft[] {
  const sections =
    format === "markdown" ? splitMarkdownSections(text) : [{ heading: null, body: text }];
  const chunks: ChunkDraft[] = [];
  for (const section of sections) {
    for (const content of packSection(section.body, options)) {
      chunks.push({ ordinal: chunks.length, heading: section.heading, content });
    }
  }
  return chunks;
}

export function splitMarkdownSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const trail: string[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) sections.push({ heading, body });
    lines = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) {
      lines.push(line);
      continue;
    }
    flush();
    const level = match[1]!.length;
    trail.length = level - 1;
    trail[level - 1] = match[2]!;
    heading = trail.filter(Boolean).join(" › ");
  }
  flush();
  return sections;
}

function packSection(body: string, { maxChars, overlapChars }: ChunkOptions): string[] {
  const units = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > maxChars ? splitLongParagraph(p, maxChars) : [p]));

  const chunks: string[] = [];
  let current: string[] = [];
  let hasNewContent = false;

  for (const unit of units) {
    if (hasNewContent && [...current, unit].join("\n\n").length > maxChars) {
      chunks.push(current.join("\n\n"));
      current = overlapTail(current.at(-1)!, overlapChars);
      hasNewContent = false;
    }
    current.push(unit);
    hasNewContent = true;
  }
  if (hasNewContent) chunks.push(current.join("\n\n"));
  return chunks;
}

/** The longest run of trailing sentences that fits in `limit` characters (possibly none). */
function overlapTail(text: string, limit: number): string[] {
  const sentences = splitSentences(text);
  let tail = "";
  for (let i = sentences.length - 1; i >= 0; i--) {
    const candidate = sentences[i] + (tail ? " " + tail : "");
    if (candidate.length > limit) break;
    tail = candidate;
  }
  return tail ? [tail] : [];
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const pieces = splitSentences(paragraph).flatMap((s) =>
    s.length > maxChars ? hardWrap(s, maxChars) : [s],
  );
  const out: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + 1 + piece.length > maxChars) {
      out.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) out.push(current);
  return out;
}

export function splitSentences(text: string): string[] {
  return Array.from(sentenceSegmenter.segment(text), (s) => s.segment.trim()).filter(Boolean);
}

/** Last resort for a single "sentence" longer than a chunk (tables, logs): cut at word boundaries. */
function hardWrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + 1 + word.length > maxChars) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}
