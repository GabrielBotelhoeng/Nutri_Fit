-- Migration 003 (Fase 4): RPC para registrar agua diaria
-- RPC separada de acumular_registro_diario para evitar regressao (D-03)

CREATE OR REPLACE FUNCTION registrar_agua_diaria(
  p_paciente_id UUID,
  p_data        DATE,
  p_agua_ml     INTEGER
) RETURNS VOID AS $$
BEGIN
  INSERT INTO registros_diarios (paciente_id, data, agua_ml)
  VALUES (p_paciente_id, p_data, p_agua_ml)
  ON CONFLICT (paciente_id, data) DO UPDATE SET
    agua_ml    = registros_diarios.agua_ml + EXCLUDED.agua_ml,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;
