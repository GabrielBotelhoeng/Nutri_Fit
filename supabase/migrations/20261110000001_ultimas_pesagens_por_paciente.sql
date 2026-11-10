-- Últimas N pesagens de cada paciente (lista do painel de adesão precisa só de 2).
-- Buscar 90 dias em lote estourava o max_rows do PostgREST (1000) e o corte levava
-- justamente as pesagens mais recentes, sem erro.
CREATE OR REPLACE FUNCTION ultimas_pesagens_por_paciente(ids UUID[], n INT DEFAULT 2)
RETURNS TABLE (paciente_id UUID, data DATE, peso_kg NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT t.paciente_id, t.data, t.peso_kg
  FROM (
    SELECT p.paciente_id, p.data, p.peso_kg,
           row_number() OVER (PARTITION BY p.paciente_id ORDER BY p.data DESC) AS rn
    FROM pesagens p
    WHERE p.paciente_id = ANY(ids)
  ) t
  WHERE t.rn <= n
  ORDER BY t.paciente_id, t.data;
$$;
REVOKE ALL ON FUNCTION ultimas_pesagens_por_paciente(UUID[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ultimas_pesagens_por_paciente(UUID[], INT) TO service_role;
