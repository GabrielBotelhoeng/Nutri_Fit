import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { somarDias } from '../utils/datas';

// I/O em lote (Task 2) usa este cliente.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export interface PesagemAdesao {
  data: string;
  peso_kg: number;
}

export interface EntradaAdesao {
  agora: Date;
  hoje: string;
  criadoEm: Date;
  expirado: boolean;
  diasComKcal: string[];
  ultimaRefeicaoEm: Date | null;
  pesagens: PesagemAdesao[];
  pesoInicialKg: number | null;
}

export type MotivoAtencao = 'sem_registro_48h' | 'baixa_adesao';

export interface ResumoAdesao {
  dias_com_registro_7d: number;
  ultimo_registro_em: string | null;
  peso_atual_kg: number | null;
  peso_tendencia: 'subiu' | 'desceu' | 'estavel' | null;
  precisa_atencao: boolean;
  motivo: MotivoAtencao | null;
}

// Mesmo limite do "Sumiu?" do bot (alertas.ts): painel e bot contam a mesma história.
const SEM_REGISTRO_MS = 48 * 3600_000;
const CADASTRO_MINIMO_BAIXA_ADESAO_MS = 7 * 24 * 3600_000;
const LIMIAR_BAIXA_ADESAO = 2;

export function resumirAdesao(e: EntradaAdesao): ResumoAdesao {
  // 7 dias completos: hoje não conta, pro paciente não parecer mal pela manhã.
  const inicio = somarDias(e.hoje, -7);
  const fim = somarDias(e.hoje, -1);
  const dias = new Set(e.diasComKcal.filter((d) => d >= inicio && d <= fim)).size;

  const agoraMs = e.agora.getTime();
  const referencia = e.ultimaRefeicaoEm ?? e.criadoEm;
  const semRegistro = agoraMs - referencia.getTime() >= SEM_REGISTRO_MS;
  // Paciente novo não é punido pelos dias antes de existir.
  const baixaAdesao =
    dias <= LIMIAR_BAIXA_ADESAO && agoraMs - e.criadoEm.getTime() >= CADASTRO_MINIMO_BAIXA_ADESAO_MS;
  // Expirado já tem card próprio (renovação); não polui a triagem.
  const motivo: MotivoAtencao | null = e.expirado
    ? null
    : semRegistro
      ? 'sem_registro_48h'
      : baixaAdesao
        ? 'baixa_adesao'
        : null;

  const n = e.pesagens.length;
  const ultima = n > 0 ? e.pesagens[n - 1] : null;
  const base = n >= 2 ? e.pesagens[n - 2].peso_kg : e.pesoInicialKg;
  let tendencia: ResumoAdesao['peso_tendencia'] = null;
  if (ultima && base !== null) {
    const delta = Math.round((ultima.peso_kg - base) * 10) / 10;
    tendencia = delta <= -0.1 ? 'desceu' : delta >= 0.1 ? 'subiu' : 'estavel';
  }

  return {
    dias_com_registro_7d: dias,
    ultimo_registro_em: e.ultimaRefeicaoEm ? e.ultimaRefeicaoEm.toISOString() : null,
    peso_atual_kg: ultima ? ultima.peso_kg : null,
    peso_tendencia: tendencia,
    precisa_atencao: motivo !== null,
    motivo,
  };
}
