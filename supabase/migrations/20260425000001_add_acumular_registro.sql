-- Migration 007: RPC acumular_registro_diario
-- Necessária para Fase 3 — evita o pitfall de UPSERT que sobrescreve em vez de acumular.
-- O client-side upsert do Supabase sobrescreve campos; esta RPC garante soma atômica.

CREATE OR REPLACE FUNCTION acumular_registro_diario(
  p_paciente_id UUID,
  p_data        DATE,
  p_kcal        NUMERIC,
  p_proteina_g  NUMERIC,
  p_carbo_g     NUMERIC,
  p_gordura_g   NUMERIC
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO registros_diarios (paciente_id, data, kcal_consumido, proteina_g, carbo_g, gordura_g)
  VALUES (p_paciente_id, p_data, p_kcal, p_proteina_g, p_carbo_g, p_gordura_g)
  ON CONFLICT (paciente_id, data)
  DO UPDATE SET
    kcal_consumido = registros_diarios.kcal_consumido + EXCLUDED.kcal_consumido,
    proteina_g     = registros_diarios.proteina_g     + EXCLUDED.proteina_g,
    carbo_g        = registros_diarios.carbo_g        + EXCLUDED.carbo_g,
    gordura_g      = registros_diarios.gordura_g      + EXCLUDED.gordura_g,
    updated_at     = now();
$$;

-- Garantir que apenas usuários autenticados (service_role) possam chamar
REVOKE ALL ON FUNCTION acumular_registro_diario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acumular_registro_diario TO service_role;
