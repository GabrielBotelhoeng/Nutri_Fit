-- Migration P2-7: dedup de eventos do webhook por message_id.
-- A Evolution API pode reentregar o mesmo evento (timeout/restart);
-- sem essa trava o agente processa a mesma mensagem duas vezes e
-- registra refeicao em duplicidade.
--
-- Estrategia: o webhook tenta INSERT no topo do handler; se UNIQUE
-- VIOLATION (codigo 23505) significa que ja foi processada e a mensagem
-- e descartada silenciosamente. PK em message_id ja indexa pra lookup O(log n).

CREATE TABLE IF NOT EXISTS mensagens_processadas (
  message_id   TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mensagens_processadas IS
  'P2-7: dedup de eventos do webhook Evolution. PK em message_id; o webhook tenta INSERT e descarta a mensagem se houver unique_violation (reentrega).';
