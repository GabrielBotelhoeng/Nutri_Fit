-- Migration 001: Schema NutriChat v1

-- Tabela pacientes
CREATE TABLE IF NOT EXISTS pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL UNIQUE,
  plano TEXT NOT NULL CHECK (plano IN ('1mes', '3meses', '6meses', '12meses')),
  data_expiracao DATE NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela dietas (D-03: uma ativa por paciente; historico preservado)
CREATE TABLE IF NOT EXISTS dietas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  pdf_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'expirada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dietas_paciente_status ON dietas(paciente_id, status);

-- Tabela refeicoes
CREATE TABLE IF NOT EXISTS refeicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  kcal NUMERIC(8,2),
  proteina_g NUMERIC(8,2),
  carbo_g NUMERIC(8,2),
  gordura_g NUMERIC(8,2),
  tipo_registro TEXT CHECK (tipo_registro IN ('texto', 'audio', 'foto', 'codigo_barras', 'rotulo')),
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refeicoes_paciente_data ON refeicoes(paciente_id, registrado_em);

-- Tabela registros_diarios (D-02: uma linha por paciente/data, UPDATE acumula)
CREATE TABLE IF NOT EXISTS registros_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  kcal_consumido NUMERIC(8,2) NOT NULL DEFAULT 0,
  proteina_g NUMERIC(8,2) NOT NULL DEFAULT 0,
  carbo_g NUMERIC(8,2) NOT NULL DEFAULT 0,
  gordura_g NUMERIC(8,2) NOT NULL DEFAULT 0,
  agua_ml INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (paciente_id, data)
);
CREATE INDEX IF NOT EXISTS idx_registros_diarios_paciente ON registros_diarios(paciente_id, data DESC);

-- Tabela alertas_config (D-01: uma linha por paciente, colunas por tipo)
CREATE TABLE IF NOT EXISTS alertas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE UNIQUE,
  horario_cafe TEXT,
  horario_almoco TEXT,
  horario_jantar TEXT,
  horarios_agua TEXT[] DEFAULT ARRAY[]::TEXT[],
  horario_suplementos TEXT[] DEFAULT ARRAY[]::TEXT[],
  ativo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pacientes_updated_at BEFORE UPDATE ON pacientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER registros_diarios_updated_at BEFORE UPDATE ON registros_diarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER alertas_config_updated_at BEFORE UPDATE ON alertas_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
