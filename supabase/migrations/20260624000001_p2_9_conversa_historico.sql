-- Migration P2-9: memoria de conversa pra perguntas de follow-up
-- ("e no jantar?", "e se eu trocar?"). Hoje o agente e single-turn —
-- cada chamada Claude recebe so a pergunta atual, sem contexto.
--
-- Estrategia: tabela append-only com role + content. A leitura usa
-- LIMIT N ORDER BY criado_em DESC; o agente reverte pra ordem cronologica
-- antes de mandar pro Claude. Sem TTL agressivo aqui — o limite e aplicado
-- na leitura, nao na escrita (deixa o historico completo pro nutricionista
-- auditar no painel).

CREATE TABLE IF NOT EXISTS conversa_historico (
  id           BIGSERIAL PRIMARY KEY,
  paciente_id  UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup principal: ultimas N mensagens de um paciente.
-- DESC pra casar com ORDER BY do SELECT (index scan direto).
CREATE INDEX IF NOT EXISTS idx_conversa_historico_paciente_criado
  ON conversa_historico (paciente_id, criado_em DESC);

COMMENT ON TABLE conversa_historico IS
  'P2-9: historico de turnos da conversa paciente <-> agente Claude. Lido em LIMIT N pra dar contexto multi-turn ao consultar a dieta.';
