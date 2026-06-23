import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// P2-7: dedup de eventos do webhook. A Evolution API as vezes reentrega o
// mesmo evento (timeout, restart, reconexao) e sem essa trava a mesma
// refeicao seria registrada duas vezes.
//
// Contrato: retorna true se a mensagem deve ser processada (id novo);
// false se ja foi processada antes (descartar).
//
// Fail-open: se o INSERT falhar por motivo de infra (DB offline, rede),
// loga e retorna true — vale mais entregar 2x do que perder uma mensagem.
// Duplicacao real e detectada pelo PgError 23505 (unique_violation).
export async function marcarMensagemProcessada(messageId: string): Promise<boolean> {
  if (!messageId) return true;

  const { error } = await supabase
    .from('mensagens_processadas')
    .insert({ message_id: messageId });

  if (!error) return true;
  if (error.code === '23505') return false; // duplicada, esperado

  console.error('[dedup] Erro ao marcar mensagem processada:', error.message);
  return true; // fail-open: infra ruim nao bloqueia o agente
}
