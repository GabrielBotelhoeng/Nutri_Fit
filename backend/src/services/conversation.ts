import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export type ObjetivoNutricional = 'emagrecer' | 'ganhar_massa' | 'manter' | 'saude_geral';

export interface EstadoEntrevista {
  status: 'pendente' | 'em_andamento' | 'completa';
  etapa: number;
  dados: {
    idade?: number;
    objetivo?: ObjetivoNutricional;
    sexo?: 'masculino' | 'feminino';
    peso_kg?: number;
    altura_cm?: number;
    atividade_tipo?: string;
    atividade_frequencia?: string;
    atividade_horario?: string;
    // Rotina: estruturado quando o paciente envia 2 horas validas (0-23);
    // raw quando texto livre nao casa com regex (fallback sem prender o usuario).
    rotina_acordar?: number;
    rotina_dormir?: number;
    rotina_horarios_raw?: string;
    restricoes?: string[];
    preferencias_recusas?: string[];
    experiencia_dieta?: string;
    suplementos?: string[];
    // Horarios das refeicoes (HH:MM) — coletados na entrevista (etapa 14)
    // quando o PDF da dieta nao traz. Servem de base para lembretes de
    // refeicao + hidratacao (Fase 4 / batch refinamentos #4).
    // Keys possiveis: cafe, lanche_manha, almoco, lanche_tarde, jantar.
    horarios_refeicoes?: Record<string, string>;
    // Resultados calculados apos conclusao da entrevista
    tmb_kcal?: number;
    tdee_kcal?: number;
    hidratacao_ml?: number;
    creatina_g?: number;
    // Metas diarias de macros (ajustadas pelo objetivo) — ponto unico de verdade
    // consumido por meal.ts, vision.ts, agent.ts ao montar saldo do dia.
    metas_kcal?: number;
    metas_proteina_g?: number;
    metas_carbo_g?: number;
    metas_gordura_g?: number;
    // Campos dinâmicos para estado de fluxos da Fase 3 (JSONB suporta campos arbitrários)
    [key: string]: unknown;
  };
}

export interface PacienteInfo {
  id: string;
  nome: string;
  whatsapp: string;
  ativo: boolean;
  data_expiracao: string;
  entrevista_status: string;
  entrevista_etapa: number;
  entrevista_dados: Record<string, unknown>;
}

// WhatsApp BR omite o 9 do celular em numeros de 8 digitos (pre-2012).
// Tentar os dois formatos: com e sem o 9 apos o DDD.
function normalizarWhatsapp(whatsapp: string): string[] {
  const nums = [whatsapp];
  if (whatsapp.startsWith('55') && whatsapp.length === 12) {
    // 556295514963 → 5562995514963 (inserir 9 apos o DDD, posicao 4)
    nums.push(whatsapp.slice(0, 4) + '9' + whatsapp.slice(4));
  } else if (whatsapp.startsWith('55') && whatsapp.length === 13) {
    // 5562995514963 → 556295514963 (remover o 9)
    nums.push(whatsapp.slice(0, 4) + whatsapp.slice(5));
  }
  return nums;
}

export async function buscarPacientePorWhatsapp(
  whatsapp: string,
): Promise<PacienteInfo | null> {
  const alternativas = normalizarWhatsapp(whatsapp);

  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, ativo, data_expiracao, entrevista_status, entrevista_etapa, entrevista_dados')
    .in('whatsapp', alternativas)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as PacienteInfo;
}

export async function getEstado(pacienteId: string): Promise<EstadoEntrevista> {
  const { data, error } = await supabase
    .from('pacientes')
    .select('entrevista_status, entrevista_etapa, entrevista_dados')
    .eq('id', pacienteId)
    .single();

  if (error || !data) {
    return { status: 'pendente', etapa: 0, dados: {} };
  }

  return {
    status: data.entrevista_status as EstadoEntrevista['status'],
    etapa: data.entrevista_etapa,
    dados: data.entrevista_dados as EstadoEntrevista['dados'],
  };
}

export async function atualizarEstado(
  pacienteId: string,
  update: Partial<{
    status: EstadoEntrevista['status'];
    etapa: number;
    dados: Partial<EstadoEntrevista['dados']>;
  }>,
): Promise<void> {
  const campos: Record<string, unknown> = {};
  if (update.status !== undefined) campos['entrevista_status'] = update.status;
  if (update.etapa !== undefined) campos['entrevista_etapa'] = update.etapa;
  if (update.dados !== undefined) {
    // Merge com dados existentes via Supabase JSONB concat
    const { data: current } = await supabase
      .from('pacientes')
      .select('entrevista_dados')
      .eq('id', pacienteId)
      .single();
    campos['entrevista_dados'] = { ...(current?.entrevista_dados ?? {}), ...update.dados };
  }

  const { error } = await supabase.from('pacientes').update(campos).eq('id', pacienteId);
  if (error) {
    throw new Error(`[conversation] Falha ao atualizar estado do paciente ${pacienteId}: ${error.message}`);
  }
}
