import type pg from "pg";
import type { Chunk } from "@/domain/types";
import { toVector } from "./pool";

export interface LexicalHit {
  id: string;
  rank: number;
}

export interface VectorHit {
  id: string;
  similarity: number;
}

const CHUNK_COLUMNS = `c.id, c.document_id AS "documentId", d.title AS "documentTitle",
  c.ordinal, c.heading, c.content`;

export class ChunksRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Full-text search with OR semantics: `plainto_tsquery` stems and drops stop words, then its
   * AND operators are relaxed to OR so a natural-language question still matches passages that
   * share only some of its terms. `ts_rank_cd` rewards terms that appear close together.
   */
  async lexicalSearch(query: string, limit: number): Promise<LexicalHit[]> {
    const { rows } = await this.pool.query<LexicalHit>(
      `WITH q AS (
         SELECT nullif(replace(plainto_tsquery('english', $1)::text, ' & ', ' | '), '')::tsquery AS tsq
       )
       SELECT c.id, ts_rank_cd(c.tsv, q.tsq) AS rank
       FROM chunks c
       JOIN documents d ON d.id = c.document_id AND d.status = 'ready'
       CROSS JOIN q
       WHERE c.tsv @@ q.tsq
       ORDER BY rank DESC, c.id
       LIMIT $2`,
      [query, limit],
    );
    return rows;
  }

  /** Nearest neighbours by cosine distance (HNSW index); similarity = 1 - distance. */
  async vectorSearch(embedding: number[], limit: number): Promise<VectorHit[]> {
    const { rows } = await this.pool.query<VectorHit>(
      `SELECT c.id, 1 - (c.embedding <=> $1::vector) AS similarity
       FROM chunks c
       JOIN documents d ON d.id = c.document_id AND d.status = 'ready'
       ORDER BY c.embedding <=> $1::vector
       LIMIT $2`,
      [toVector(embedding), limit],
    );
    return rows;
  }

  async getMany(ids: string[]): Promise<Chunk[]> {
    const { rows } = await this.pool.query<Chunk>(
      `SELECT ${CHUNK_COLUMNS} FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.id = ANY($1::uuid[])`,
      [ids],
    );
    return rows;
  }

  async get(id: string): Promise<Chunk | null> {
    return (await this.getMany([id]))[0] ?? null;
  }
}
