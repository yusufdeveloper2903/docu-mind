import type pg from "pg";
import type { ChunkDraft, DocumentRecord } from "@/domain/types";
import { toVector } from "./pool";

const COLUMNS = `id, title, filename, mime_type AS "mimeType", size_bytes AS "sizeBytes", status, error,
  chunk_count AS "chunkCount", created_at AS "createdAt"`;

export type NewDocument = Pick<DocumentRecord, "title" | "filename" | "mimeType" | "sizeBytes">;
export type EmbeddedChunk = ChunkDraft & { embedding: number[] };

export class DocumentsRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(doc: NewDocument): Promise<DocumentRecord> {
    const { rows } = await this.pool.query<DocumentRecord>(
      `INSERT INTO documents (title, filename, mime_type, size_bytes) VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [doc.title, doc.filename, doc.mimeType, doc.sizeBytes],
    );
    return rows[0]!;
  }

  async list(): Promise<DocumentRecord[]> {
    const { rows } = await this.pool.query<DocumentRecord>(
      `SELECT ${COLUMNS} FROM documents ORDER BY created_at DESC`,
    );
    return rows;
  }

  async get(id: string): Promise<DocumentRecord | null> {
    const { rows } = await this.pool.query<DocumentRecord>(
      `SELECT ${COLUMNS} FROM documents WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findReadyByFilename(filename: string): Promise<DocumentRecord | null> {
    const { rows } = await this.pool.query<DocumentRecord>(
      `SELECT ${COLUMNS} FROM documents WHERE filename = $1 AND status = 'ready' LIMIT 1`,
      [filename],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM documents WHERE id = $1", [id]);
    return rowCount === 1;
  }

  /** Stores all chunks and flips the document to `ready` atomically. */
  async completeIngestion(documentId: string, chunks: EmbeddedChunk[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM chunks WHERE document_id = $1", [documentId]);
      await client.query(
        `INSERT INTO chunks (document_id, ordinal, heading, content, embedding)
         SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::vector[])`,
        [
          documentId,
          chunks.map((c) => c.ordinal),
          chunks.map((c) => c.heading),
          chunks.map((c) => c.content),
          chunks.map((c) => toVector(c.embedding)),
        ],
      );
      await client.query(
        "UPDATE documents SET status = 'ready', chunk_count = $2, error = NULL WHERE id = $1",
        [documentId, chunks.length],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.pool.query("UPDATE documents SET status = 'failed', error = $2 WHERE id = $1", [
      id,
      error,
    ]);
  }
}
