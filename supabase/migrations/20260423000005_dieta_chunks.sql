-- Migration 005: Tabela dieta_chunks para RAG granular

-- Chunks de texto extraidos dos PDFs das dietas
CREATE TABLE IF NOT EXISTS dieta_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dieta_id UUID NOT NULL REFERENCES dietas(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dieta_chunks_dieta ON dieta_chunks(dieta_id);
CREATE INDEX IF NOT EXISTS idx_dieta_chunks_paciente ON dieta_chunks(paciente_id);
CREATE INDEX IF NOT EXISTS idx_dieta_chunks_embedding ON dieta_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS
ALTER TABLE dieta_chunks ENABLE ROW LEVEL SECURITY;

-- Pacientes autenticados so leem seus proprios chunks
CREATE POLICY "paciente_read_own_chunks"
  ON dieta_chunks FOR SELECT TO authenticated
  USING (paciente_id = auth.uid());

-- Apenas service_role pode inserir, atualizar e deletar
CREATE POLICY "service_write_chunks"
  ON dieta_chunks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Funcao de busca semantica por paciente
CREATE OR REPLACE FUNCTION match_chunks_paciente(
  query_embedding vector(1536),
  p_paciente_id UUID,
  match_threshold FLOAT DEFAULT 0.6,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM dieta_chunks dc
  WHERE dc.paciente_id = p_paciente_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
