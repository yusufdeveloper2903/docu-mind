CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  filename    text        NOT NULL,
  mime_type   text        NOT NULL,
  size_bytes  integer     NOT NULL CHECK (size_bytes >= 0),
  status      text        NOT NULL DEFAULT 'processing'
                          CHECK (status IN ('processing', 'ready', 'failed')),
  error       text,
  chunk_count integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid    NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  heading     text,
  content     text    NOT NULL,
  -- Headings weigh more than body text in lexical ranking.
  tsv         tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('english', coalesce(heading, '')), 'A') ||
                setweight(to_tsvector('english', content), 'B')
              ) STORED,
  embedding   vector(384) NOT NULL,
  UNIQUE (document_id, ordinal)
);

CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text        NOT NULL,
  -- Assistant answers keep their cited segments: [{ text, citations: [{ source, chunkId, citedText }] }]
  segments        jsonb       NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
