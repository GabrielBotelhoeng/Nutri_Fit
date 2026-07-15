import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Retorna true se e id novo (processar); false se ja foi visto (descartar).
// Fail-open: falha de infra libera a mensagem — melhor 2x que perder.
// Duplicacao real e o PgError 23505 (unique_violation).
export async function marcarMensagemProcessada(messageId: string): Promise<boolean> {
  if (!messageId) return true;

  const { error } = await supabase
    .from('mensagens_processadas')
    .insert({ message_id: messageId });

  if (!error) return true;
  if (error.code === '23505') return false;

  console.error('[dedup] Erro ao marcar mensagem processada:', error.message);
  return true;
}
