import type { DocumentFormat, DocumentRecord, Embedder } from "@/domain/types";
import { ValidationError } from "@/domain/errors";
import type { DocumentsRepository } from "@/infra/db/documents-repo";
import { deriveTitle, detectFormat, extractText, mimeTypeFor } from "@/infra/parsers";
import { chunkDocument, DEFAULT_CHUNK_OPTIONS, type ChunkOptions } from "./chunker";

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

export interface RegisteredUpload {
  document: DocumentRecord;
  format: DocumentFormat;
}

type DocumentStore = Pick<DocumentsRepository, "create" | "get" | "completeIngestion" | "markFailed">;

/**
 * Ingestion runs in two steps so the HTTP layer can answer immediately: `register` validates the
 * file and records it as `processing`; `process` parses, chunks, embeds and stores it, leaving
 * the document `ready` or `failed` (with the reason) - it never throws.
 */
export class IngestionService {
  constructor(
    private readonly documents: DocumentStore,
    private readonly embedder: Embedder,
    private readonly chunkOptions: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
  ) {}

  async register(file: UploadedFile): Promise<RegisteredUpload> {
    const format = detectFormat(file.name);
    if (file.bytes.byteLength === 0) throw new ValidationError(`"${file.name}" is empty.`);
    const preview = format === "markdown" ? new TextDecoder().decode(file.bytes.subarray(0, 4096)) : "";
    const document = await this.documents.create({
      title: deriveTitle(file.name, preview, format),
      filename: file.name,
      mimeType: mimeTypeFor(format),
      sizeBytes: file.bytes.byteLength,
    });
    return { document, format };
  }

  async process({ document, format }: RegisteredUpload, bytes: Uint8Array): Promise<void> {
    try {
      const text = await extractText(bytes, format);
      const drafts = chunkDocument(text, format, this.chunkOptions);
      if (drafts.length === 0) throw new Error("No extractable text found in this file.");
      const embeddings = await this.embedder.embedDocuments(
        drafts.map((d) => [document.title, d.heading, d.content].filter(Boolean).join("\n")),
      );
      await this.documents.completeIngestion(
        document.id,
        drafts.map((d, i) => ({ ...d, embedding: embeddings[i]! })),
      );
    } catch (error) {
      await this.documents.markFailed(document.id, (error as Error).message);
    }
  }

  /** Register and process in one go (seed script, tests). Returns the final record. */
  async ingest(file: UploadedFile): Promise<DocumentRecord> {
    const upload = await this.register(file);
    await this.process(upload, file.bytes);
    return (await this.documents.get(upload.document.id)) ?? upload.document;
  }
}
