-- Migration: RPC corrigir_registro_diario
-- Aplica delta (positivo OU negativo) sobre registros_diarios mantendo o
-- invariante de que nenhum macro fica negativo (GREATEST(0, ...)).
-- Usado pelo fluxo de "corrigir ultima refeicao" do agente — quando o
-- paciente diz "na verdade foram 200g de frango + 100g de arroz + ..." o
-- backend calcula o delta (novos macros - antigos) e chama esta RPC em
-- vez de inserir um segundo registro.

CREATE OR REPLACE FUNCTION corrigir_registro_diario(
  p_paciente_id UUID,
  p_data        DATE,
  p_delta_kcal       NUMERIC,
  p_delta_proteina_g NUMERIC,
  p_delta_carbo_g    NUMERIC,
  p_delta_gordura_g  NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE registros_diarios
  SET
    kcal_consumido = GREATEST(0, kcal_consumido + p_delta_kcal),
    proteina_g     = GREATEST(0, proteina_g     + p_delta_proteina_g),
    carbo_g        = GREATEST(0, carbo_g        + p_delta_carbo_g),
    gordura_g      = GREATEST(0, gordura_g      + p_delta_gordura_g),
    updated_at     = now()
  WHERE paciente_id = p_paciente_id AND data = p_data;

  IF NOT FOUND THEN
    -- Sem row pra corrigir (nao deveria acontecer no fluxo normal — quem
    -- corrige ja registrou antes), mas se for o caso, cria com o delta
    -- saturado em 0 pra nao quebrar invariante NOT NULL.
    INSERT INTO registros_diarios (paciente_id, data, kcal_consumido, proteina_g, carbo_g, gordura_g)
    VALUES (
      p_paciente_id,
      p_data,
      GREATEST(0, p_delta_kcal),
      GREATEST(0, p_delta_proteina_g),
      GREATEST(0, p_delta_carbo_g),
      GREATEST(0, p_delta_gordura_g)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION corrigir_registro_diario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION corrigir_registro_diario TO service_role;
