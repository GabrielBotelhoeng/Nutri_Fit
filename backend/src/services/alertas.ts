import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { sendText } from './evolution';
import { redactPhone, redactName } from '../utils/redact';
import { hojeLocal } from '../utils/datas';

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

// O cron do N8N roda de 15 em 15 min (:00/:15/:30/:45). Comparar por igualdade
// perdia horários fora dessa grade ("almoço 12h20" nunca disparava) e disparos
// atrasados ("12:16"). Cada disparo cobre o quarto de hora [início, início+15).
const JANELA_MIN = 15;

function paraMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function horarioNaJanela(horario: string | null | undefined, disparo: string): boolean {
  if (!horario) return false;
  const h = paraMinutos(horario);
  const d = paraMinutos(disparo);
  if (h === null || d === null) return false;
  const inicio = d - (d % JANELA_MIN);
  return h >= inicio && h < inicio + JANELA_MIN;
}

export const MENSAGEM_REENGAJAMENTO =
  '👋 Sumiu? Tudo bem, recomeçar faz parte. Me manda o que você comeu hoje que eu anoto pra você 💚';

const REFEICAO_RECENTE_MS = 60 * 60 * 1000;
const INATIVIDADE_MS = 48 * 60 * 60 * 1000;

export interface ContextoDecisao {
  agora: Date;
  refeicoesCasadas: RefeicaoKey[];
  aguaCasou: boolean;
  suplementoCasou: boolean;
  disparoDoReengajamento: boolean;
  aguaHojeMl: number;
  metaAguaMl: number;
  ultimaRefeicaoEm: Date | null;
  pacienteCriadoEm: Date;
  ultimoReengajamentoEm: Date | null;
}

export interface DecisaoAlertas {
  refeicoes: RefeicaoKey[];
  agua: boolean;
  suplemento: boolean;
  reengajar: boolean;
}

// Lembrete que reage ao comportamento: não cobra o que já foi feito e, pra quem sumiu,
// troca a rotina (que vira spam e leva a bloqueio) por UMA mensagem por sequência de inatividade.
export function decidirAlertas(ctx: ContextoDecisao): DecisaoAlertas {
  const agoraMs = ctx.agora.getTime();
  const referencia = ctx.ultimaRefeicaoEm ?? ctx.pacienteCriadoEm;

  if (agoraMs - referencia.getTime() >= INATIVIDADE_MS) {
    const jaReengajado =
      ctx.ultimoReengajamentoEm !== null &&
      (ctx.ultimaRefeicaoEm === null || ctx.ultimoReengajamentoEm > ctx.ultimaRefeicaoEm);
    return {
      refeicoes: [],
      agua: false,
      suplemento: false,
      reengajar: ctx.disparoDoReengajamento && !jaReengajado,
    };
  }

  const refeicaoRecente =
    ctx.ultimaRefeicaoEm !== null && agoraMs - ctx.ultimaRefeicaoEm.getTime() < REFEICAO_RECENTE_MS;
  const aguaBatida = ctx.metaAguaMl > 0 && ctx.aguaHojeMl >= ctx.metaAguaMl;

  return {
    refeicoes: refeicaoRecente ? [] : ctx.refeicoesCasadas,
    agua: ctx.aguaCasou && !aguaBatida,
    suplemento: ctx.suplementoCasou,
    reengajar: false,
  };
}

interface ContextoPacientes {
  aguaHoje: Map<string, number>;
  ultimaRefeicao: Map<string, Date>;
}

// Uma consulta por fonte pro lote inteiro (não N por paciente), cada uma devolvendo
// no máximo 1 linha por paciente — refeições cruas estouravam o max_rows do PostgREST.
// Falha → null e o disparo segue sem filtros: melhor lembrar demais do que deixar de lembrar.
async function carregarContexto(ids: string[]): Promise<ContextoPacientes | null> {
  try {
    const [regs, refs] = await Promise.all([
      supabase.from('registros_diarios').select('paciente_id, agua_ml').in('paciente_id', ids).eq('data', hojeLocal()),
      supabase.rpc('ultima_refeicao_por_paciente', { ids }),
    ]);
    if (regs.error) throw new Error(regs.error.message);
    if (refs.error) throw new Error(refs.error.message);

    const aguaHoje = new Map<string, number>();
    for (const r of (regs.data ?? []) as Array<{ paciente_id: string; agua_ml: number | string | null }>) {
      aguaHoje.set(r.paciente_id, Number(r.agua_ml) || 0);
    }
    const ultimaRefeicao = new Map<string, Date>();
    for (const r of (refs.data ?? []) as Array<{ paciente_id: string; ultima: string | null }>) {
      if (r.ultima) ultimaRefeicao.set(r.paciente_id, new Date(r.ultima));
    }
    return { aguaHoje, ultimaRefeicao };
  } catch (err) {
    console.error('[alertas] Falha ao carregar contexto (seguindo sem filtros):', err);
    return null;
  }
}

export async function dispararAlertas(horario: string): Promise<void> {
  console.log(`[alertas] Verificando alertas para horario ${horario}`);
  const agora = new Date();

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
      ultimo_reengajamento_em,
      pacientes!inner(whatsapp, nome, ativo, created_at, entrevista_dados)
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

  const candidatos = [];
  for (const config of configs) {
    const refeicoesCasadas = REFEICOES_KEYS.filter((k) =>
      horarioNaJanela((config as unknown as Record<string, string | null>)[KEY_TO_COL[k]], horario),
    );
    const aguaArr = (config.horarios_agua as string[]) || [];
    const aguaCasou = aguaArr.some((h) => horarioNaJanela(h, horario));
    const supArr = (config.horario_suplementos as string[]) || [];
    const suplementoCasou = supArr.some((h) => horarioNaJanela(h, horario));
    if (refeicoesCasadas.length === 0 && !aguaCasou && !suplementoCasou) continue;

    // Reengajamento sai no almoço (ou no 1º horário de refeição) pra não chegar de madrugada.
    const horarioReengajamento =
      config.horario_almoco ??
      REFEICOES_KEYS.map((k) => (config as unknown as Record<string, string | null>)[KEY_TO_COL[k]]).find(Boolean) ??
      null;

    candidatos.push({
      config,
      aguaArr,
      refeicoesCasadas,
      aguaCasou,
      suplementoCasou,
      disparoDoReengajamento: horarioNaJanela(horarioReengajamento, horario),
    });
  }

  if (candidatos.length === 0) {
    console.log(`[alertas] Concluido — 0 alertas enviados para horario ${horario}`);
    return;
  }

  const contexto = await carregarContexto(candidatos.map((c) => String(c.config.paciente_id)));

  let enviados = 0;

  for (const c of candidatos) {
    const pacienteId = String(c.config.paciente_id);
    const paciente = c.config.pacientes as unknown as {
      whatsapp: string;
      nome: string;
      ativo: boolean;
      created_at: string;
      entrevista_dados: Record<string, unknown> | null;
    };
    const wpp = paciente.whatsapp;
    const hidratacaoMl = Number(paciente.entrevista_dados?.['hidratacao_ml']) || 0;

    const decisao = contexto
      ? decidirAlertas({
          agora,
          refeicoesCasadas: c.refeicoesCasadas,
          aguaCasou: c.aguaCasou,
          suplementoCasou: c.suplementoCasou,
          disparoDoReengajamento: c.disparoDoReengajamento,
          aguaHojeMl: contexto.aguaHoje.get(pacienteId) ?? 0,
          metaAguaMl: hidratacaoMl,
          ultimaRefeicaoEm: contexto.ultimaRefeicao.get(pacienteId) ?? null,
          pacienteCriadoEm: new Date(paciente.created_at),
          ultimoReengajamentoEm: c.config.ultimo_reengajamento_em
            ? new Date(c.config.ultimo_reengajamento_em as string)
            : null,
        })
      : { refeicoes: c.refeicoesCasadas, agua: c.aguaCasou, suplemento: c.suplementoCasou, reengajar: false };

    if (decisao.reengajar) {
      await sendText(wpp, MENSAGEM_REENGAJAMENTO);
      const { error: errUpd } = await supabase
        .from('alertas_config')
        .update({ ultimo_reengajamento_em: agora.toISOString() })
        .eq('paciente_id', pacienteId);
      if (errUpd) console.error('[alertas] Falha ao marcar reengajamento:', errUpd.message);
      console.log(`[alertas] reengajamento enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    for (const tipo of decisao.refeicoes) {
      await sendText(wpp, MENSAGENS_REFEICAO[tipo]);
      console.log(`[alertas] ${tipo} enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    if (decisao.agua) {
      const porcaoMl = c.aguaArr.length > 0 && hidratacaoMl > 0
        ? Math.ceil(hidratacaoMl / c.aguaArr.length)
        : null;
      await sendText(wpp, mensagemAgua(porcaoMl));
      console.log(`[alertas] agua (${porcaoMl ?? 'porcao padrao'}ml) enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    if (decisao.suplemento) {
      await sendText(wpp, MENSAGENS_REFEICAO['suplemento']);
      console.log(`[alertas] suplemento enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }
  }

  console.log(`[alertas] Concluido — ${enviados} alertas enviados para horario ${horario}`);
}
