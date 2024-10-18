exports.up = function (knex) {
  return knex.raw(`
      -- Enable the pgvector extension
      CREATE EXTENSION IF NOT EXISTS vector;
  
      -- Create documents table
      CREATE TABLE IF NOT EXISTS documents (
        id bigserial PRIMARY KEY,
        content text,
        metadata jsonb,
        embedding vector(1536)
      );
  
      -- Create match_documents function
      CREATE OR REPLACE FUNCTION match_documents (
        query_embedding vector(1536),
        match_count int DEFAULT NULL,
        filter jsonb DEFAULT '{}'
      ) RETURNS TABLE (
        id bigint,
        content text,
        metadata jsonb,
        embedding jsonb,
        similarity float
      ) LANGUAGE plpgsql
      AS $$
      #variable_conflict use_column
      BEGIN
        RETURN QUERY
        SELECT
          id,
          content,
          metadata,
          (embedding::text)::jsonb AS embedding,
          1 - (documents.embedding <=> query_embedding) AS similarity
        FROM documents
        WHERE metadata @> filter
        ORDER BY documents.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$;
    `);
};

exports.down = function (knex) {
  return knex.raw(`
      -- Drop the function and table in reverse migration
      DROP FUNCTION IF EXISTS match_documents;
      DROP TABLE IF EXISTS documents;
      DROP EXTENSION IF EXISTS vector;
    `);
};
