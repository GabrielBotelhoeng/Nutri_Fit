-- Migration 003: Row Level Security em todas as tabelas NutriChat

-- Habilitar RLS
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dietas ENABLE ROW LEVEL SECURITY;
ALTER TABLE refeicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_config ENABLE ROW LEVEL SECURITY;

-- Politicas para service_role (backend Express usa SUPABASE_SERVICE_KEY)
-- service_role bypassa RLS automaticamente no Supabase — nenhuma policy necessaria para ele

-- Politicas para authenticated (nutricionista logado no painel web — Fase 5)
-- Por enquanto: acesso total para authenticated (refinado na Fase 5 com auth real)
CREATE POLICY "authenticated_full_access_pacientes"
  ON pacientes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_dietas"
  ON dietas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_refeicoes"
  ON refeicoes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_registros_diarios"
  ON registros_diarios FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_alertas_config"
  ON alertas_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- anon nao tem nenhuma policy — acesso negado por padrao com RLS ativo
