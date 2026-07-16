import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { sendText } from './evolution';
import { redactPhone, redactName } from '../utils/redact';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// 'agua' e funcao porque a porcao varia por paciente (hidratacao_ml / N_horarios).
const MENSAGENS_REFEICAO: Record<string, string> = {
  cafe:         '☀️ Hora do café! Lembre-se de registrar sua refeição da manhã no NutriChat. 🥗',
  lanche_manha: '🥪 Hora do lanche da manhã! Registre no NutriChat o que você comer. 🥗',
  almoco:       '🌞 Hora do almoço! Não esqueça de registrar o que você comer. 🍽️',
  lanche_tarde: '🍎 Hora do lanche da tarde! Mantenha o ritmo — registre no NutriChat. 🥗',
  jantar:       '🌙 Hora do jantar! Registre sua refeição noturna no NutriChat. 🥗',
  suplemento:   '💊 Hora dos suplementos! Não esqueça de tomar e registrar no NutriChat.',
};

function mensagemAgua(porcaoMl: number | null): string {
  if (porcaoMl && porcaoMl > 0) {
    return `💧 Hora de hidratar! Beba ~${porcaoMl}ml de água agora e registre: "bebi ${porcaoMl}ml". 💚`;
  }
  return '💧 Hora de hidratar! Beba um copo d\'água agora e registre: "bebi 300ml". 💚';
}

// Keys de entrevista_dados.horarios_refeicoes na ordem do dia.
export const REFEICOES_KEYS = ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar'] as const;
export type RefeicaoKey = typeof REFEICOES_KEYS[number];

const KEY_TO_COL: Record<RefeicaoKey, string> = {
  cafe:         'horario_cafe',
  lanche_manha: 'horario_lanche_manha',
  almoco:       'horario_almoco',
  lanche_tarde: 'horario_lanche_tarde',
  jantar:       'horario_jantar',
};

export interface AlertasConfigPayload {
  paciente_id: string;
  horario_cafe: string | null;
  horario_lanche_manha: string | null;
  horario_almoco: string | null;
  horario_lanche_tarde: string | null;
  horario_jantar: string | null;
  horarios_agua: string[];
  ativo: boolean;
}

// horarios_agua = mesmos das refeicoes; porcao vem no disparo (hidratacao_ml / N).
export function montarAlertasConfigPayload(
  pacienteId: string,
  horariosRefeicoes: Record<string, string> | null | undefined,
): AlertasConfigPayload {
  const refeicoes = horariosRefeicoes ?? {};
  const horariosAgua: string[] = [];

  const payload: AlertasConfigPayload = {
    paciente_id: pacienteId,
    horario_cafe: null,
    horario_lanche_manha: null,
    horario_almoco: null,
    horario_lanche_tarde: null,
    horario_jantar: null,
    horarios_agua: [],
    ativo: true,
  };

  for (const key of REFEICOES_KEYS) {
    const hora = refeicoes[key];
    if (typeof hora !== 'string' || hora.length === 0) continue;
    (payload as unknown as Record<string, string | null>)[KEY_TO_COL[key]] = hora;
    horariosAgua.push(hora);
  }

  payload.horarios_agua = horariosAgua;
  return payload;
}

// Idempotente via UNIQUE(paciente_id). Nao apaga config existente quando
// entrevista vem sem horarios (nutricionista pode ter preenchido manual).
export async function sincronizarAlertasDaEntrevista(
  pacienteId: string,
  horariosRefeicoes: Record<string, string> | null | undefined,
): Promise<void> {
  if (!horariosRefeicoes || Object.keys(horariosRefeicoes).length === 0) {
    console.log(`[alertas] sincronizacao skip para ${pacienteId} — horarios_refeicoes vazio`);
    return;
  }

  const payload = montarAlertasConfigPayload(pacienteId, horariosRefeicoes);

  const { error } = await supabase
    .from('alertas_config')
    .upsert(payload, { onConflict: 'paciente_id' });

  if (error) {
    throw new Error(`[alertas] Falha ao sincronizar alertas_config (${pacienteId}): ${error.message}`);
  }

  console.log(`[alertas] sincronizado para ${pacienteId} (${payload.horarios_agua.length} horarios cadastrados)`);
}

export async function dispararAlertas(horario: string): Promise<void> {
  console.log(`[alertas] Verificando alertas para horario ${horario}`);

  // entrevista_dados vem junto pra calcular porcao de agua no disparo.
  const { data: configs, error } = await supabase
    .from('alertas_config')
    .select(`
      paciente_id,
      horario_cafe,
      horario_lanche_manha,
      horario_almoco,
      horario_lanche_tarde,
      horario_jantar,
      horarios_agua,
      horario_suplementos,
      pacientes!inner(whatsapp, nome, ativo, entrevista_dados)
    `)
    .eq('ativo', true)
    .eq('pacientes.ativo', true);

  if (error) {
    console.error('[alertas] Erro ao buscar configuracoes:', error.message);
    return;
  }

  if (!configs || configs.length === 0) {
    console.log('[alertas] Nenhuma configuracao ativa — skip');
    return;
  }

  let enviados = 0;

  for (const config of configs) {
    const paciente = config.pacientes as unknown as {
      whatsapp: string;
      nome: string;
      ativo: boolean;
      entrevista_dados: Record<string, unknown> | null;
    };
    const wpp = paciente.whatsapp;

    const refeicoesParaEnviar: RefeicaoKey[] = [];

    if (config.horario_cafe === horario)         refeicoesParaEnviar.push('cafe');
    if (config.horario_lanche_manha === horario) refeicoesParaEnviar.push('lanche_manha');
    if (config.horario_almoco === horario)       refeicoesParaEnviar.push('almoco');
    if (config.horario_lanche_tarde === horario) refeicoesParaEnviar.push('lanche_tarde');
    if (config.horario_jantar === horario)       refeicoesParaEnviar.push('jantar');

    const aguaArr = (config.horarios_agua as string[]) || [];
    const aguaCasou = aguaArr.includes(horario);

    const supArr = (config.horario_suplementos as string[]) || [];
    const suplementoCasou = supArr.includes(horario);

    if (refeicoesParaEnviar.length === 0 && !aguaCasou && !suplementoCasou) continue;

    for (const tipo of refeicoesParaEnviar) {
      await sendText(wpp, MENSAGENS_REFEICAO[tipo]);
      console.log(`[alertas] ${tipo} enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    if (aguaCasou) {
      const hidratacaoMl = Number(paciente.entrevista_dados?.['hidratacao_ml']) || 0;
      const porcaoMl = aguaArr.length > 0 && hidratacaoMl > 0
        ? Math.ceil(hidratacaoMl / aguaArr.length)
        : null;
      await sendText(wpp, mensagemAgua(porcaoMl));
      console.log(`[alertas] agua (${porcaoMl ?? 'porcao padrao'}ml) enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    if (suplementoCasou) {
      await sendText(wpp, MENSAGENS_REFEICAO['suplemento']);
      console.log(`[alertas] suplemento enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }
  }

  console.log(`[alertas] Concluido — ${enviados} alertas enviados para horario ${horario}`);
}
