-- Pesagens do paciente: uma por dia, reenvio no mesmo dia sobrescreve (upsert).
CREATE TABLE IF NOT EXISTS pesagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  peso_kg NUMERIC(5,2) NOT NULL CHECK (peso_kg BETWEEN 30 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (paciente_id, data)
);
CREATE INDEX IF NOT EXISTS idx_pesagens_paciente_data ON pesagens(paciente_id, data DESC);

-- Sem policies: só a service role (backend) acessa, mesmo padrão do sec_3.
ALTER TABLE pesagens ENABLE ROW LEVEL SECURITY;

-- Controle do reengajamento: uma mensagem por sequência de inatividade.
ALTER TABLE alertas_config ADD COLUMN IF NOT EXISTS ultimo_reengajamento_em TIMESTAMPTZ;
