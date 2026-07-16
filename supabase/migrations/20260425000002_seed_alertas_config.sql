-- Seed alertas_config para paciente de teste local.
-- Substitua o WhatsApp abaixo pelo do paciente-alvo antes de aplicar em dev.
-- Em producao (Supabase remoto) este seed nao encontra paciente e vira no-op.
-- ON CONFLICT garante idempotencia: pode ser re-executado sem erros.

INSERT INTO alertas_config (paciente_id, horario_cafe, horario_almoco, horario_jantar, horarios_agua, horario_suplementos, ativo)
SELECT
  p.id,
  '07:30',                                     -- cafe da manha
  '12:00',                                     -- almoco
  '19:30',                                     -- jantar
  ARRAY['09:00', '11:00', '15:00', '17:00'],  -- agua 4x ao dia
  ARRAY['07:00', '21:00'],                     -- suplementos
  true
FROM pacientes p
WHERE p.whatsapp = '5511987654321'  -- placeholder — trocar em dev
ON CONFLICT (paciente_id) DO UPDATE SET
  horario_cafe         = EXCLUDED.horario_cafe,
  horario_almoco       = EXCLUDED.horario_almoco,
  horario_jantar       = EXCLUDED.horario_jantar,
  horarios_agua        = EXCLUDED.horarios_agua,
  horario_suplementos  = EXCLUDED.horario_suplementos,
  ativo                = EXCLUDED.ativo;
