import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { hojeLocal, somarDias } from '../utils/datas';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export interface Pesagem {
  data: string;
  peso_kg: number;
}

export const MSG_PESO_INVALIDO =
  '⚖️ Não entendi o peso. Me manda só o número, ex: "pesei 78,5".';

// Primeiro número plausível como peso corporal (30–300). Pegar o primeiro número da
// frase errava em "hoje às 7h pesei 78,4" (lia 7).
export function extrairPesoDaMensagem(texto: string): number | null {
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = parseFloat(m[0].replace(',', '.'));
    if (n >= 30 && n <= 300) return n;
  }
  return null;
}

const round1 =(n: number): number => Math.round(n * 10) / 10;
const fmtKg = (n: number): string => n.toFixed(1).replace('.', ',');
// "−" (U+2212) em vez de "-": no WhatsApp o hífen some no meio do texto.
const fmtDelta = (d: number): string => `${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))}`;
const fmtDiaMes = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export function formatarRespostaPeso(
  atualKg: number,
  anterior: Pesagem | null,
  inicialKg: number | null,
): string {
  const partes = [`⚖️ Peso registrado: ${fmtKg(atualKg)} kg`];
  if (anterior) {
    const d = round1(atualKg - anterior.peso_kg);
    const dia = fmtDiaMes(anterior.data);
    partes.push(d === 0 ? `mesmo peso de ${dia}` : `${fmtDelta(d)} kg desde ${dia}`);
  }
  if (inicialKg) {
    const d = round1(atualKg - inicialKg);
    partes.push(d === 0 ? 'mesmo peso do início' : `${fmtDelta(d)} kg desde o início`);
  }
  return `${partes.join(' · ')} 💚`;
}

// pesagens em ordem ascendente de data. Semana = últimos 7 dias (inclui hoje);
// base = pesagem mais recente antes da semana.
export function formatarLinhaPesoRelatorio(pesagens: Pesagem[], hoje: string): string {
  const inicioSemana = somarDias(hoje, -7);
  const naSemana = pesagens.filter((p) => p.data >= inicioSemana);
  if (naSemana.length === 0) {
    return '⚖️ Que tal se pesar amanhã em jejum e me mandar "pesei 78,5"?';
  }
  const atual = naSemana[naSemana.length - 1];
  const antes = pesagens.filter((p) => p.data < inicioSemana);
  const base = antes.length > 0 ? antes[antes.length - 1] : null;
  if (!base) return `⚖️ *Peso:* ${fmtKg(atual.peso_kg)} kg`;
  const d = round1(atual.peso_kg - base.peso_kg);
  const variacao = d === 0 ? 'mesmo peso da semana passada' : `${fmtDelta(d)} kg na semana`;
  return `⚖️ *Peso:* ${fmtKg(atual.peso_kg)} kg (${variacao})`;
}

function paraPesagem(r: { data: unknown; peso_kg: unknown }): Pesagem {
  return { data: String(r.data), peso_kg: Number(r.peso_kg) };
}

export async function registrarPeso(
  pacienteId: string,
  pesoKg: number,
): Promise<{ anterior: Pesagem | null }> {
  const hoje = hojeLocal();
  const { error } = await supabase
    .from('pesagens')
    .upsert(
      { paciente_id: pacienteId, data: hoje, peso_kg: pesoKg, updated_at: new Date().toISOString() },
      { onConflict: 'paciente_id,data' },
    );
  if (error) throw new Error(`[peso] Falha ao salvar pesagem: ${error.message}`);

  const { data, error: errAnterior } = await supabase
    .from('pesagens')
    .select('data, peso_kg')
    .eq('paciente_id', pacienteId)
    .lt('data', hoje)
    .order('data', { ascending: false })
    .limit(1);
  // Pesagem já foi salva; sem a anterior a resposta só fica mais curta.
  if (errAnterior) {
    console.error('[peso] Falha ao buscar pesagem anterior:', errAnterior.message);
    return { anterior: null };
  }
  const linha = (data ?? [])[0] as { data: unknown; peso_kg: unknown } | undefined;
  return { anterior: linha ? paraPesagem(linha) : null };
}

export async function pesagensDesde(pacienteId: string, desde: string): Promise<Pesagem[]> {
  const { data, error } = await supabase
    .from('pesagens')
    .select('data, peso_kg')
    .eq('paciente_id', pacienteId)
    .gte('data', desde)
    .order('data', { ascending: true });
  if (error) throw new Error(`[peso] Falha ao buscar pesagens: ${error.message}`);
  return ((data ?? []) as Array<{ data: unknown; peso_kg: unknown }>).map(paraPesagem);
}
