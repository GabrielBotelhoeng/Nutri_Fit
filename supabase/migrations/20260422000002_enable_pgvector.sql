-- Migration 002: Habilitar pgvector para embeddings RAG das dietas

-- Habilitar extensao pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Adicionar coluna de embedding na tabela dietas
-- vector(1536) = dimensoes do modelo text-embedding-ada-002 / OpenAI (compativel com LangChain + Supabase)
ALTER TABLE dietas ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index HNSW para busca de similaridade eficiente
-- Configuracao: m=16, ef_construction=64 (boa performance para < 100k vetores)
CREATE INDEX IF NOT EXISTS idx_dietas_embedding ON dietas
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Funcao para busca de similaridade (usada pelo LangChain na Fase 2)
CREATE OR REPLACE FUNCTION match_dieta_chunks(
  query_embedding vector(1536),
  paciente_id_param UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pdf_url TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.pdf_url,
    '' AS content,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM dietas d
  WHERE d.paciente_id = paciente_id_param
    AND d.status = 'ativa'
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
