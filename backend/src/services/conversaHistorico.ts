import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Memoria multi-turn pra perguntas de follow-up ("e no jantar?",
// "e se eu trocar?"). Fail-soft em tudo: erro de DB nunca derruba
// a resposta ao paciente — memoria e desejavel, nao critica.

export type ConversaMensagem = { role: 'user' | 'assistant'; content: string };

export async function registrarMensagem(
  pacienteId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from('conversa_historico')
    .insert({ paciente_id: pacienteId, role, content });

  if (error) {
    console.error('[conversaHistorico] Erro ao registrar mensagem:', error.message);
  }
}

export async function obterUltimasMensagens(
  pacienteId: string,
  limite = 12,
): Promise<ConversaMensagem[]> {
  const { data, error } = await supabase
    .from('conversa_historico')
    .select('role, content')
    .eq('paciente_id', pacienteId)
    .order('criado_em', { ascending: false })
    .limit(limite);

  if (error) {
    console.error('[conversaHistorico] Erro ao obter ultimas mensagens:', error.message);
    return [];
  }

  // SELECT vem DESC por causa do index; Claude espera cronologico.
  return ((data ?? []) as ConversaMensagem[]).reverse();
}
