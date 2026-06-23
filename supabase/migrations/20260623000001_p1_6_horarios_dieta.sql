-- Migration P1-6: extrair horarios das refeicoes do PDF da dieta.
-- Adiciona coluna jsonb em dietas para guardar o resultado da extracao
-- (Claude Haiku 4.5) executada uma vez no upload, evitando que a entrevista
-- pergunte horarios que ja estao prescritos.
--
-- Schema do jsonb:
--   { cafe, lanche_manha, almoco, lanche_tarde, jantar }
--   valores string "HH:MM" (24h) OU null = horario nao explicito no PDF
--
-- Backwards-compat: dietas antigas ficam NULL, o agent.ts trata como
-- "vazio -> pergunta normal da etapa 14" (comportamento atual).

ALTER TABLE dietas
  ADD COLUMN IF NOT EXISTS horarios_refeicoes JSONB;

COMMENT ON COLUMN dietas.horarios_refeicoes IS
  'P1-6: horarios extraidos do PDF via Haiku. Schema { cafe, lanche_manha, almoco, lanche_tarde, jantar } com strings "HH:MM" ou null. Null = nao explicito no PDF.';
