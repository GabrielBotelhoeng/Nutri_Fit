-- Migration: adiciona coluna processamento_status na tabela dietas
-- Motivo: heuristica de janela 5min em GET /api/pacientes era fragil
-- (qualquer falha persistente como quota OpenAI ficava 'processando' para sempre).
-- Agora o status e persistido pelo proprio rag.ts apos sucesso/falha.

ALTER TABLE dietas
  ADD COLUMN IF NOT EXISTS processamento_status TEXT NOT NULL DEFAULT 'processando'
  CHECK (processamento_status IN ('processando', 'indexado', 'falhou'));

-- Backfill: dietas com chunks ja inseridos contam como 'indexado';
-- as sem chunks contam como 'falhou' (nao reprocessam sozinhas).
UPDATE dietas d
SET processamento_status = CASE
  WHEN EXISTS (SELECT 1 FROM dieta_chunks dc WHERE dc.dieta_id = d.id) THEN 'indexado'
  ELSE 'falhou'
END
WHERE d.processamento_status = 'processando';
