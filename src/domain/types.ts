export type DocumentStatus = "processing" | "ready" | "failed";
export type DocumentFormat = "pdf" | "markdown" | "text";

export interface DocumentRecord {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

/** A piece of a document produced by the chunker, before it is embedded and stored. */
export interface ChunkDraft {
  ordinal: number;
  heading: string | null;
  content: string;
}

export interface Chunk extends ChunkDraft {
  id: string;
  documentId: string;
  documentTitle: string;
}

/** A retrieved chunk handed to the answer model, numbered from 1 as shown in the UI. */
export interface Source extends Chunk {
  index: number;
  score: number;
}

export interface Citation {
  /** 1-based source number, matching `Source.index`. */
  source: number;
  chunkId: string;
  citedText: string;
}

/** One run of answer text; citations (if any) support exactly this run. */
export interface AnswerSegment {
  text: string;
  citations: Citation[];
}

export type StopReason = "end_turn" | "max_tokens" | "refusal" | "no_context" | "other";

/** What an answer provider streams back. `segment` indices are stable for the whole answer. */
export type AnswerEvent =
  | { type: "text"; segment: number; text: string }
  | { type: "citation"; segment: number; citation: Citation }
  | { type: "end"; stopReason: StopReason };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AnswerRequest {
  question: string;
  history: ChatTurn[];
  sources: Source[];
}

/** Port implemented by the Claude adapter and by the deterministic mock. */
export interface AnswerProvider {
  stream(request: AnswerRequest, signal?: AbortSignal): AsyncIterable<AnswerEvent>;
}

/** Events the chat endpoint streams to the browser as NDJSON. */
export type ChatEvent =
  | { type: "start"; conversationId: string; sources: SourceSummary[] }
  | AnswerEvent
  | { type: "error"; message: string };

export type SourceSummary = Pick<Source, "index" | "documentId" | "documentTitle" | "heading"> & {
  chunkId: string;
};

export interface Embedder {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
