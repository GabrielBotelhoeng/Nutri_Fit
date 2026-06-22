-- Adiciona horarios de lanche da manha e tarde em alertas_config.
-- Fonte: etapa 14 da entrevista (#4 Fatia 1) coleta as 5 keys
-- (cafe, lanche_manha, almoco, lanche_tarde, jantar). As 3 ja existiam;
-- estas 2 fecham o alinhamento com o que o paciente cadastra.
-- Idempotente: IF NOT EXISTS.

ALTER TABLE alertas_config
  ADD COLUMN IF NOT EXISTS horario_lanche_manha TEXT,
  ADD COLUMN IF NOT EXISTS horario_lanche_tarde TEXT;
