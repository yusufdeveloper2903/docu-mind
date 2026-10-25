import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngestionService } from "@/services/ingestion";

// Route handlers are tested as plain functions; the container is replaced with fakes.
const container = vi.hoisted(() => ({
  config: { MAX_UPLOAD_MB: 1 },
  documents: { list: vi.fn(), delete: vi.fn() },
  chunks: { get: vi.fn() },
  ingestion: { register: vi.fn(), process: vi.fn() },
  chat: { ask: vi.fn() },
}));
vi.mock("@/container", () => ({ getContainer: () => container }));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => void task(),
  connection: async () => undefined,
}));

const { POST: chat } = await import("@/app/api/chat/route");
const { POST: upload } = await import("@/app/api/documents/route");
const { DELETE: deleteDocument } = await import("@/app/api/documents/[id]/route");
const { GET: getChunk } = await import("@/app/api/chunks/[id]/route");

const UUID = "30000000-0000-4000-8000-000000000000";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const postJson = (body: string) =>
  new Request("http://test/api/chat", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
const postFiles = (...files: File[]) => {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  return new Request("http://test/api/documents", { method: "POST", body: form });
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/chat", () => {
  it.each([
    ["malformed JSON", "{", "request body"],
    ["an empty question", JSON.stringify({ question: "   " }), "question"],
    [
      "a non-UUID conversation id",
      JSON.stringify({ question: "Hi", conversationId: "42" }),
      "conversationId",
    ],
    ["an overlong question", JSON.stringify({ question: "x".repeat(2001) }), "question"],
  ])("rejects %s with a 400 problem response", async (_name, body, path) => {
    const response = await chat(postJson(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const problem = await response.json();
    expect(problem).toMatchObject({ status: 400, title: "Validation Failed" });
    if (path !== "request body") expect(problem.errors[0].path).toBe(path);
    expect(container.chat.ask).not.toHaveBeenCalled();
  });

  it("streams NDJSON events for a valid question", async () => {
    container.chat.ask.mockResolvedValue(
      (async function* () {
        yield { type: "start", conversationId: UUID, sources: [] };
        yield { type: "end", stopReason: "end_turn" };
      })(),
    );
    const response = await chat(postJson(JSON.stringify({ question: "Vacation?" })));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(["start", "end"]);
  });
});

describe("POST /api/documents", () => {
  it("requires at least one file", async () => {
    const response = await upload(postFiles());
    expect(response.status).toBe(400);
  });

  it("rejects files above the upload limit", async () => {
    const big = new File([new Uint8Array(1024 * 1024 + 1)], "big.txt");
    const response = await upload(postFiles(big));
    expect(response.status).toBe(400);
    expect((await response.json()).detail).toContain("exceeds 1 MB");
  });

  it("rejects unsupported file types with 415", async () => {
    // Use the real validation logic for the type check.
    const real = new IngestionService({} as never, {} as never);
    container.ingestion.register.mockImplementation((file) => real.register(file));
    const response = await upload(postFiles(new File(["x"], "slides.pptx")));
    expect(response.status).toBe(415);
  });

  it("answers 202 with the registered documents and processes them after the response", async () => {
    container.ingestion.register.mockImplementation(async ({ name }) => ({
      document: { id: UUID, filename: name, status: "processing" },
      format: "text",
    }));
    const response = await upload(postFiles(new File(["hello"], "notes.txt")));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual([
      { id: UUID, filename: "notes.txt", status: "processing" },
    ]);
    expect(container.ingestion.process).toHaveBeenCalledOnce();
  });
});

describe("id routes", () => {
  it("validate ids before touching the database", async () => {
    expect((await getChunk(new Request("http://test"), params("nope"))).status).toBe(400);
    expect((await deleteDocument(new Request("http://test"), params("nope"))).status).toBe(400);
    expect(container.chunks.get).not.toHaveBeenCalled();
    expect(container.documents.delete).not.toHaveBeenCalled();
  });

  it("return 404 for unknown ids", async () => {
    container.chunks.get.mockResolvedValue(null);
    container.documents.delete.mockResolvedValue(false);
    expect((await getChunk(new Request("http://test"), params(UUID))).status).toBe(404);
    expect((await deleteDocument(new Request("http://test"), params(UUID))).status).toBe(404);
  });
});
