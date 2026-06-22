-- Migration 006: Colunas de entrevista na tabela pacientes

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS entrevista_status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (entrevista_status IN ('pendente', 'em_andamento', 'completa')),
  ADD COLUMN IF NOT EXISTS entrevista_dados JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS entrevista_etapa INTEGER NOT NULL DEFAULT 0;

-- entrevista_dados armazena: idade, sexo, peso_kg, altura_cm, atividade_tipo,
--   atividade_frequencia, atividade_horario, suplementos (array)
-- entrevista_etapa: 0=nao iniciada, 1=idade, 2=sexo, 3=peso, 4=altura, 5=atividade, 6=suplementos, 7=completa
