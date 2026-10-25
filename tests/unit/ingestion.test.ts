import { describe, expect, it, vi } from "vitest";
import { UnsupportedDocumentError, ValidationError } from "@/domain/errors";
import type { DocumentRecord, Embedder } from "@/domain/types";
import { IngestionService } from "@/services/ingestion";

const encode = (text: string) => new TextEncoder().encode(text);

function setup() {
  const record = (fields: Partial<DocumentRecord>): DocumentRecord => ({
    id: "doc-1",
    title: "",
    filename: "",
    mimeType: "",
    sizeBytes: 0,
    status: "processing",
    error: null,
    chunkCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  });
  const documents = {
    create: vi.fn(async (doc: Partial<DocumentRecord>) => record(doc)),
    get: vi.fn(async () => record({ status: "ready" })),
    completeIngestion: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
  const embedder: Embedder = {
    embedDocuments: vi.fn(async (texts: string[]) => texts.map((_, i) => [i, 1])),
    embedQuery: async () => [0, 1],
  };
  return { service: new IngestionService(documents, embedder), documents, embedder };
}

describe("IngestionService", () => {
  it("registers a Markdown file with its H1 as the title", async () => {
    const { service, documents } = setup();
    const { format } = await service.register({
      name: "faq.md",
      bytes: encode("# Beacon FAQ\nText"),
    });
    expect(format).toBe("markdown");
    expect(documents.create).toHaveBeenCalledWith({
      title: "Beacon FAQ",
      filename: "faq.md",
      mimeType: "text/markdown",
      sizeBytes: 17,
    });
  });

  it("titles other files after their filename", async () => {
    const { service, documents } = setup();
    await service.register({ name: "security_policy-v2.txt", bytes: encode("Text") });
    expect(documents.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Security policy v2" }),
    );
  });

  it("rejects unsupported and empty files before anything is stored", async () => {
    const { service, documents } = setup();
    await expect(
      service.register({ name: "deck.pptx", bytes: encode("x") }),
    ).rejects.toBeInstanceOf(UnsupportedDocumentError);
    await expect(
      service.register({ name: "empty.txt", bytes: new Uint8Array() }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(documents.create).not.toHaveBeenCalled();
  });

  it("embeds each chunk with its document title and heading for context", async () => {
    const { service, documents, embedder } = setup();
    const bytes = encode("# Handbook\n## Leave\n28 days of vacation.");
    await service.ingest({ name: "handbook.md", bytes });

    expect(embedder.embedDocuments).toHaveBeenCalledWith([
      "Handbook\nHandbook › Leave\n28 days of vacation.",
    ]);
    expect(documents.completeIngestion).toHaveBeenCalledWith("doc-1", [
      {
        ordinal: 0,
        heading: "Handbook › Leave",
        content: "28 days of vacation.",
        embedding: [0, 1],
      },
    ]);
  });

  it("marks the document failed (instead of throwing) when processing fails", async () => {
    const { service, documents } = setup();
    const upload = await service.register({ name: "blank.md", bytes: encode("# Only a heading") });
    await service.process(upload, encode("# Only a heading"));
    expect(documents.markFailed).toHaveBeenCalledWith(
      "doc-1",
      "No extractable text found in this file.",
    );
    expect(documents.completeIngestion).not.toHaveBeenCalled();
  });
});
