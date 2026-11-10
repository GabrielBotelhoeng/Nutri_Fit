import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { hojeLocal, somarDias } from '../utils/datas';
import { obterMetas } from './calculos';

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

const JANELA_PESAGENS_DIAS = 90;
const DIAS_FICHA = 14;

export interface PacienteParaAdesao {
  id: string;
  created_at: string;
  expirado: boolean;
  peso_inicial_kg: number | null;
}

type Linha = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

async function ultimaRefeicaoPorPaciente(ids: string[]): Promise<Map<string, Date>> {
  const { data, error } = await supabase.rpc('ultima_refeicao_por_paciente', { ids });
  if (error) throw new Error(error.message);
  const mapa = new Map<string, Date>();
  for (const r of (data ?? []) as Linha[]) {
    if (r.ultima) mapa.set(String(r.paciente_id), new Date(String(r.ultima)));
  }
  return mapa;
}

function agruparPesagens(linhas: Linha[]): Map<string, PesagemAdesao[]> {
  const mapa = new Map<string, PesagemAdesao[]>();
  for (const r of linhas) {
    const id = String(r.paciente_id);
    const lista = mapa.get(id) ?? [];
    lista.push({ data: String(r.data), peso_kg: num(r.peso_kg) });
    mapa.set(id, lista);
  }
  return mapa;
}

// Uma consulta por fonte pro lote todo. Registros têm ≤ 7 linhas/paciente (cabem no
// max_rows de 1000 do PostgREST até ~140 pacientes); última refeição e pesagens vêm
// de RPCs que já devolvem poucas linhas por paciente — buscar 90 dias de pesagens em
// lote estourava o limite e cortava justamente as mais recentes, sem erro.
// Falha → null: a lista de pacientes sai sem adesão em vez de quebrar.
export async function carregarAdesaoLista(
  pacientes: PacienteParaAdesao[],
  agora: Date = new Date(),
): Promise<Map<string, ResumoAdesao> | null> {
  if (pacientes.length === 0) return new Map();
  const ids = pacientes.map((p) => p.id);
  const hoje = hojeLocal();
  try {
    const [regs, ultimas, pesos] = await Promise.all([
      supabase
        .from('registros_diarios')
        .select('paciente_id, data')
        .in('paciente_id', ids)
        .gt('kcal_consumido', 0)
        .gte('data', somarDias(hoje, -7))
        .lte('data', somarDias(hoje, -1)),
      ultimaRefeicaoPorPaciente(ids),
      // Tendência só compara a última com a anterior: 2 por paciente bastam.
      supabase.rpc('ultimas_pesagens_por_paciente', { ids, n: 2 }),
    ]);
    if (regs.error) throw new Error(regs.error.message);
    if (pesos.error) throw new Error(pesos.error.message);

    const diasPorPaciente = new Map<string, string[]>();
    for (const r of (regs.data ?? []) as Linha[]) {
      const id = String(r.paciente_id);
      diasPorPaciente.set(id, [...(diasPorPaciente.get(id) ?? []), String(r.data)]);
    }
    const pesagensPorPaciente = agruparPesagens((pesos.data ?? []) as Linha[]);

    const resultado = new Map<string, ResumoAdesao>();
    for (const p of pacientes) {
      resultado.set(
        p.id,
        resumirAdesao({
          agora,
          hoje,
          criadoEm: new Date(p.created_at),
          expirado: p.expirado,
          diasComKcal: diasPorPaciente.get(p.id) ?? [],
          ultimaRefeicaoEm: ultimas.get(p.id) ?? null,
          pesagens: pesagensPorPaciente.get(p.id) ?? [],
          pesoInicialKg: p.peso_inicial_kg,
        }),
      );
    }
    return resultado;
  } catch (err) {
    console.error('[adesao] Falha ao carregar adesão da lista (seguindo sem):', err);
    return null;
  }
}

export interface DiaAdesao {
  data: string;
  kcal: number;
  proteina_g: number;
  agua_ml: number;
}

export interface FichaAdesao {
  metas: { kcal: number; proteina_g: number; agua_ml: number | null };
  dias: DiaAdesao[];
  pesagens: PesagemAdesao[];
  peso_inicial_kg: number | null;
  resumo: ResumoAdesao;
}

export async function obterFichaAdesao(
  pacienteId: string,
  agora: Date = new Date(),
): Promise<FichaAdesao | null> {
  const { data: paciente, error } = await supabase
    .from('pacientes')
    .select('id, created_at, ativo, data_expiracao, entrevista_dados')
    .eq('id', pacienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!paciente) return null;

  const hoje = hojeLocal();
  const inicio = somarDias(hoje, -(DIAS_FICHA - 1));
  const [regs, ultimas, pesos] = await Promise.all([
    supabase
      .from('registros_diarios')
      .select('data, kcal_consumido, proteina_g, agua_ml')
      .eq('paciente_id', pacienteId)
      .gte('data', inicio)
      .lte('data', hoje),
    ultimaRefeicaoPorPaciente([pacienteId]),
    supabase
      .from('pesagens')
      .select('paciente_id, data, peso_kg')
      .eq('paciente_id', pacienteId)
      .gte('data', somarDias(hoje, -JANELA_PESAGENS_DIAS))
      .order('data', { ascending: true }),
  ]);
  if (regs.error) throw new Error(regs.error.message);
  if (pesos.error) throw new Error(pesos.error.message);

  const porData = new Map<string, Linha>();
  for (const r of (regs.data ?? []) as Linha[]) porData.set(String(r.data), r);
  const dias: DiaAdesao[] = [];
  for (let i = 0; i < DIAS_FICHA; i++) {
    const data = somarDias(inicio, i);
    const r = porData.get(data);
    dias.push({
      data,
      kcal: r ? num(r.kcal_consumido) : 0,
      proteina_g: r ? num(r.proteina_g) : 0,
      agua_ml: r ? num(r.agua_ml) : 0,
    });
  }

  const p = paciente as Linha;
  const entrevista = (p.entrevista_dados ?? {}) as Record<string, unknown>;
  const metas = obterMetas(entrevista);
  const pesoInicialKg = num(entrevista['peso_kg']) || null;
  // Consulta já é de um paciente só: não depender de paciente_id na linha.
  const pesagens: PesagemAdesao[] = ((pesos.data ?? []) as Linha[]).map((r) => ({ data: String(r.data), peso_kg: num(r.peso_kg) }));
  const expirado = !p.ativo || new Date(String(p.data_expiracao)) < agora;

  return {
    metas: { kcal: metas.kcal, proteina_g: metas.proteina_g, agua_ml: metas.agua_ml ?? null },
    dias,
    pesagens,
    peso_inicial_kg: pesoInicialKg,
    resumo: resumirAdesao({
      agora,
      hoje,
      criadoEm: new Date(String(p.created_at)),
      expirado,
      diasComKcal: dias.filter((d) => d.kcal > 0).map((d) => d.data),
      ultimaRefeicaoEm: ultimas.get(pacienteId) ?? null,
      pesagens,
      pesoInicialKg,
    }),
  };
}
