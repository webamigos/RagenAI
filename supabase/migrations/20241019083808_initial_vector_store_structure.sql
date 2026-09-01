-- Schema for the Supabase vector-store backend.
--
-- READ THIS FIRST: this backend is NOT usable as shipped. Ingest lives in
-- apps/worker (ADR-26) and writes to Qdrant unconditionally, so a table created
-- here is never filled and retrieval against it returns nothing. See ADR-31 and
-- packages/rag-core/src/vector-store-backends.ts. The file is kept as a
-- starting point for anyone adapting the backend, not as a working setup.
--
-- The dimensionality below MUST match the embedding model in use. 3584 is
-- DEFAULT_VECTOR_SIZE, the width of bge-multilingual-gemma2 (the default). It
-- said 1536 until 2026-09 — a leftover from the OpenAI-embeddings era, which
-- would have made every insert fail on a dimension mismatch. If you set
-- EMBEDDINGS_MODEL and VECTOR_SIZE, change both occurrences here to match.

-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store your documents
create table if not exists documents (
  id bigserial primary key,
  content text, -- corresponds to Document.pageContent
  metadata jsonb, -- corresponds to Document.metadata
  embedding vector(3584) -- must equal VECTOR_SIZE; see the header
);

-- Create a function to search for documents
create or replace function match_documents (
  query_embedding vector(3584),
  match_count int DEFAULT null,
  filter jsonb DEFAULT '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  embedding jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    (embedding::text)::jsonb as embedding,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;