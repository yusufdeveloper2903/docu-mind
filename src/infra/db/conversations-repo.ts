import type pg from "pg";
import type { AnswerSegment, ChatTurn } from "@/domain/types";

export class ConversationsRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(title: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      "INSERT INTO conversations (title) VALUES ($1) RETURNING id",
      [title.slice(0, 120)],
    );
    return rows[0]!.id;
  }

  async exists(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("SELECT 1 FROM conversations WHERE id = $1", [id]);
    return rowCount === 1;
  }

  async addMessage(
    conversationId: string,
    role: ChatTurn["role"],
    content: string,
    segments: AnswerSegment[] = [],
  ): Promise<void> {
    await this.pool.query(
      "INSERT INTO messages (conversation_id, role, content, segments) VALUES ($1, $2, $3, $4)",
      [conversationId, role, content, JSON.stringify(segments)],
    );
  }

  /** The last `limit` messages in chronological order. */
  async recentTurns(conversationId: string, limit: number): Promise<ChatTurn[]> {
    const { rows } = await this.pool.query<ChatTurn>(
      `SELECT role, content FROM (
         SELECT role, content, created_at, id FROM messages WHERE conversation_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2
       ) recent ORDER BY created_at, id`,
      [conversationId, limit],
    );
    return rows;
  }
}
