import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { sendText } from './evolution';
import { hojeLocal, somarDias } from '../utils/datas';
import { obterMetas, type MacrosDiarios } from './calculos';
import { calcularStreak, type StreakInfo } from './meal';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Faixas de status kcal por dia. >110% = ultrapassou (alerta principal), 90-110%
// = na meta, 70-90% = abaixo (recuperavel), <70% com registro = bem abaixo, 0 =
// sem registro. Espelha OVERSHOOT_THRESHOLD e STREAK_TOLERANCIA de meal.ts.
export type StatusDia = 'acima' | 'na_meta' | 'abaixo' | 'bem_abaixo' | 'sem_registro';

export function statusDia(kcal: number, meta: number): StatusDia {
  if (kcal <= 0 || meta <= 0) return 'sem_registro';
  const ratio = kcal / meta;
  if (ratio > 1.10) return 'acima';
  if (ratio >= 0.90) return 'na_meta';
  if (ratio >= 0.70) return 'abaixo';
  return 'bem_abaixo';
}

const EMOJI_STATUS: Record<StatusDia, string> = {
  acima: '🔴',
  na_meta: '✅',
  abaixo: '⚠️',
  bem_abaixo: '❌',
  sem_registro: '—',
};

// Barra de 10 blocos + marcador '▶' quando ultrapassa 110% da meta. Distinta da
// barraProgresso de meal.ts (que satura em 100%) porque aqui precisamos sinalizar
// o overflow visualmente no relatorio semanal.
export function barraKcalDia(kcal: number, meta: number, blocos = 10): string {
  if (meta <= 0 || kcal <= 0) return '░'.repeat(blocos);
  const ratio = kcal / meta;
  const cheios = Math.min(Math.round(ratio * blocos), blocos);
  const barra = '█'.repeat(cheios) + '░'.repeat(blocos - cheios);
  return ratio > 1.10 ? `${barra}▶` : barra;
}

const DIAS_BR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

// Ancora a data ISO no meio-dia do fuso do paciente (America/Sao_Paulo) pra
// evitar que UTC-3 empurre pro dia anterior. getDay() do Date interpreta como
// fuso local do runtime (Docker=UTC), mas com meio-dia -03:00 o instante cai
// no mesmo dia em qualquer fuso comum, permitindo weekday consistente.
export function diaSemanaBR(dataISO: string): string {
  const d = new Date(`${dataISO}T12:00:00-03:00`);
  return DIAS_BR[d.getUTCDay()] ?? '';
}

const MESES_BR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function formatarDataRangeBR(inicioISO: string, fimISO: string): string {
  const fmt = (iso: string): string => {
    const [, m, d] = iso.split('-').map(Number);
    return `${String(d).padStart(2, '0')}/${MESES_BR[(m ?? 1) - 1]}`;
  };
  return `${fmt(inicioISO)} → ${fmt(fimISO)}`;
}

interface DiaAgregado {
  data: string;
  kcal: number;
  proteina: number;
  carbo: number;
  gordura: number;
  agua: number;
}

interface RegistroBruto {
  data: string;
  kcal_consumido: number | string | null;
  proteina_g: number | string | null;
  carbo_g: number | string | null;
  gordura_g: number | string | null;
  agua_ml: number | string | null;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function agregarDias(regs: RegistroBruto[], dataInicio: string): DiaAgregado[] {
  const porData = new Map<string, RegistroBruto>();
  for (const r of regs) porData.set(String(r.data), r);
  const dias: DiaAgregado[] = [];
  for (let i = 0; i < 7; i++) {
    const dataISO = somarDias(dataInicio, i);
    const r = porData.get(dataISO);
    dias.push({
      data: dataISO,
      kcal: r ? num(r.kcal_consumido) : 0,
      proteina: r ? num(r.proteina_g) : 0,
      carbo: r ? num(r.carbo_g) : 0,
      gordura: r ? num(r.gordura_g) : 0,
      agua: r ? num(r.agua_ml) : 0,
    });
  }
  return dias;
}

interface ContextoIncentivo {
  nomePaciente: string;
  dias_com_registro: number;
  media_kcal: number;
  meta_kcal: number;
  dias_bateram_meta: number;
  dias_acima_meta: number;
  media_proteina_g: number;
  meta_proteina_g: number;
  delta_semana_pct: number | null;
}

async function gerarMensagemIncentivo(ctx: ContextoIncentivo): Promise<string> {
  const excessoLinha = ctx.dias_acima_meta > 0
    ? `- Dias que ULTRAPASSARAM a meta calorica: ${ctx.dias_acima_meta}`
    : '';
  const deltaLinha = ctx.delta_semana_pct !== null
    ? `- Media vs semana anterior: ${ctx.delta_semana_pct >= 0 ? '+' : ''}${ctx.delta_semana_pct.toFixed(1)}%`
    : '';

  const prompt = `Voce e o NutriChat, assistente nutricional via WhatsApp. Gere 1-2 frases motivacionais para ${ctx.nomePaciente}, no fechamento do relatorio semanal.

Dados da semana:
- Dias com registro: ${ctx.dias_com_registro}/7
- Media kcal/dia: ${Math.round(ctx.media_kcal)} (meta ${ctx.meta_kcal})
- Dias que bateram a meta (90-110%): ${ctx.dias_bateram_meta}
${excessoLinha}
- Media proteina/dia: ${Math.round(ctx.media_proteina_g)}g (meta ${ctx.meta_proteina_g}g)
${deltaLinha}

Regras:
- Se houve excessos, mencione com naturalidade e sugira distribuir melhor entre refeicoes ou cuidar do jantar. SEM julgar nem alarmar.
- Se foi boa semana, parabenize direto.
- Se faltou registro em varios dias, encoraje a registrar mais.
- Portugues, tom caloroso, direto. Sem markdown, sem emojis (o relatorio ja tem varios), texto puro.
- Maximo 2 frases curtas.`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Continue assim!';
}

interface DadosMensagem {
  nomePaciente: string;
  dataInicio: string;
  dataFim: string;
  dias: DiaAgregado[];
  metas: MacrosDiarios;
  mediaAtual: number;
  mediaAnterior: number;
  streak: StreakInfo | undefined;
  incentivo: string;
}

export function formatarMensagemRelatorio(d: DadosMensagem): string {
  const comReg = d.dias.filter((x) => x.kcal > 0);
  const diasComReg = comReg.length;
  const bateram = d.dias.filter((x) => statusDia(x.kcal, d.metas.kcal) === 'na_meta').length;
  const acima = d.dias.filter((x) => statusDia(x.kcal, d.metas.kcal) === 'acima');

  // Bloco de destaque no topo quando houve excesso.
  const alerta = acima.length > 0
    ? `\n\n🔴 *Atenção:* Você ultrapassou a meta em ${acima.length} ${acima.length === 1 ? 'dia' : 'dias'} (${acima.map((x) => diaSemanaBR(x.data)).join(', ')}).`
    : '';

  // Grafico ASCII dia-a-dia. Padding fixo pra alinhar em fonte monoespaçada
  // (WhatsApp renderiza dentro do bloco ``` em monospaced).
  const linhasGrafico = d.dias.map((x) => {
    const emoji = EMOJI_STATUS[statusDia(x.kcal, d.metas.kcal)];
    const barra = barraKcalDia(x.kcal, d.metas.kcal);
    const kcalFmt = String(Math.round(x.kcal)).padStart(5, ' ');
    return `${diaSemanaBR(x.data)} ${barra} ${kcalFmt} ${emoji}`;
  }).join('\n');

  // Melhor/pior dia = maior/menor kcal entre dias com registro.
  let melhorLinha = '';
  let piorLinha = '';
  if (comReg.length > 0) {
    const melhor = comReg.reduce((a, b) => (a.kcal > b.kcal ? a : b));
    const pior = comReg.reduce((a, b) => (a.kcal < b.kcal ? a : b));
    melhorLinha = `\n• Melhor dia: ${diaSemanaBR(melhor.data)} (${Math.round(melhor.kcal)} kcal)`;
    if (comReg.length > 1) {
      piorLinha = `\n• Pior dia: ${diaSemanaBR(pior.data)} (${Math.round(pior.kcal)} kcal)`;
    }
  }

  // Δ vs semana anterior (só quando há dado anterior).
  let comparacaoLinha = '';
  if (d.mediaAnterior > 0) {
    const delta = ((d.mediaAtual - d.mediaAnterior) / d.mediaAnterior) * 100;
    const sinal = delta >= 0 ? '+' : '';
    comparacaoLinha = `\n• Semana anterior: ${Math.round(d.mediaAnterior)} kcal → *${sinal}${delta.toFixed(1)}%*`;
  }

  // Macros médios / hidratação (só divide por dias-com-registro pra não puxar
  // média pra baixo por dias em branco).
  const somaP = d.dias.reduce((s, x) => s + x.proteina, 0);
  const somaC = d.dias.reduce((s, x) => s + x.carbo, 0);
  const somaG = d.dias.reduce((s, x) => s + x.gordura, 0);
  const somaA = d.dias.reduce((s, x) => s + x.agua, 0);
  const mP = diasComReg > 0 ? somaP / diasComReg : 0;
  const mC = diasComReg > 0 ? somaC / diasComReg : 0;
  const mG = diasComReg > 0 ? somaG / diasComReg : 0;
  const mA = diasComReg > 0 ? somaA / diasComReg : 0;
  const pctP = d.metas.proteina_g > 0 ? Math.round((mP / d.metas.proteina_g) * 100) : 0;
  const pctC = d.metas.carbo_g > 0 ? Math.round((mC / d.metas.carbo_g) * 100) : 0;
  const pctG = d.metas.gordura_g > 0 ? Math.round((mG / d.metas.gordura_g) * 100) : 0;
  const metaAgua = d.metas.agua_ml && d.metas.agua_ml > 0 ? d.metas.agua_ml : 0;
  const pctA = metaAgua > 0 ? Math.round((mA / metaAgua) * 100) : 0;

  const linhaStreakTop = d.streak && Math.max(d.streak.proteina, d.streak.kcal) >= 2
    ? `\n🌱 *Streak atual:* ${Math.max(d.streak.proteina, d.streak.kcal)} dias`
    : '';

  const hidratacaoLinha = metaAgua > 0
    ? `💧 *Hidratação:* ${Math.round(mA)} ml/dia (meta ${metaAgua} ml — ${pctA}%)`
    : `💧 *Hidratação:* ${Math.round(mA)} ml/dia`;

  return (
    `📊 *Resumo da Semana — ${d.nomePaciente}*\n` +
    `_${formatarDataRangeBR(d.dataInicio, d.dataFim)}_${alerta}\n\n` +
    `🎯 *Meta atingida em ${bateram} de 7 dias*\n\n` +
    `*Kcal por dia:*\n` +
    '```\n' + linhasGrafico + '\n```\n\n' +
    `📈 *Comparação:*\n` +
    `• Média: *${Math.round(d.mediaAtual)} kcal/dia* (meta ${d.metas.kcal})` +
    comparacaoLinha +
    melhorLinha +
    piorLinha +
    `\n\n💪 *Macros médios:*\n` +
    `• Proteína: ${Math.round(mP)}g / ${d.metas.proteina_g}g (${pctP}%)\n` +
    `• Carbo: ${Math.round(mC)}g / ${d.metas.carbo_g}g (${pctC}%)\n` +
    `• Gordura: ${Math.round(mG)}g / ${d.metas.gordura_g}g (${pctG}%)\n\n` +
    hidratacaoLinha +
    linhaStreakTop +
    `\n\n💚 ${d.incentivo}`
  );
}

async function coletarRegistros(pacienteId: string, dataInicio: string, dataFim: string): Promise<RegistroBruto[]> {
  const { data, error } = await supabase
    .from('registros_diarios')
    .select('data, kcal_consumido, proteina_g, carbo_g, gordura_g, agua_ml')
    .eq('paciente_id', pacienteId)
    .gte('data', dataInicio)
    .lte('data', dataFim);
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistroBruto[];
}

export async function gerarRelatorioSemanal(): Promise<void> {
  const hoje = hojeLocal();
  const inicioSemanaAtual = somarDias(hoje, -7);
  const fimSemanaAtual = somarDias(hoje, -1);
  const inicioSemanaAnterior = somarDias(hoje, -14);
  const fimSemanaAnterior = somarDias(hoje, -8);

  const { data: pacientes, error: errPacientes } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, entrevista_dados')
    .eq('ativo', true);

  if (errPacientes) {
    console.error('[relatorio] Erro ao buscar pacientes:', errPacientes.message);
    return;
  }
  if (!pacientes || pacientes.length === 0) {
    console.log('[relatorio] Nenhum paciente ativo — skip');
    return;
  }

  for (const p of pacientes) {
    try {
      const dadosEntrevista = (p.entrevista_dados ?? {}) as Record<string, unknown>;
      const metas = obterMetas(dadosEntrevista);

      const regsAtual = await coletarRegistros(String(p.id), inicioSemanaAtual, fimSemanaAtual);
      if (regsAtual.length === 0) {
        await sendText(
          String(p.whatsapp),
          `📊 *Resumo da Semana — ${p.nome}*\n\nEssa semana não encontrei registros de refeições. Bora começar agora? Manda foto ou áudio do que comer hoje que eu já monto o card. 💚`,
        );
        continue;
      }

      const regsAnterior = await coletarRegistros(String(p.id), inicioSemanaAnterior, fimSemanaAnterior);
      const diasAtual = agregarDias(regsAtual, inicioSemanaAtual);
      const diasAnterior = agregarDias(regsAnterior, inicioSemanaAnterior);

      const diasComRegAtual = diasAtual.filter((x) => x.kcal > 0);
      const mediaAtual = diasComRegAtual.length > 0
        ? diasComRegAtual.reduce((s, x) => s + x.kcal, 0) / diasComRegAtual.length
        : 0;
      const diasComRegAnterior = diasAnterior.filter((x) => x.kcal > 0);
      const mediaAnterior = diasComRegAnterior.length > 0
        ? diasComRegAnterior.reduce((s, x) => s + x.kcal, 0) / diasComRegAnterior.length
        : 0;

      const bateram = diasAtual.filter((x) => statusDia(x.kcal, metas.kcal) === 'na_meta').length;
      const acima = diasAtual.filter((x) => statusDia(x.kcal, metas.kcal) === 'acima').length;
      const mediaProt = diasComRegAtual.length > 0
        ? diasComRegAtual.reduce((s, x) => s + x.proteina, 0) / diasComRegAtual.length
        : 0;
      const deltaPct = mediaAnterior > 0 ? ((mediaAtual - mediaAnterior) / mediaAnterior) * 100 : null;

      const streak = await calcularStreak(String(p.id), metas).catch(() => undefined);

      const incentivo = await gerarMensagemIncentivo({
        nomePaciente: String(p.nome),
        dias_com_registro: diasComRegAtual.length,
        media_kcal: mediaAtual,
        meta_kcal: metas.kcal,
        dias_bateram_meta: bateram,
        dias_acima_meta: acima,
        media_proteina_g: mediaProt,
        meta_proteina_g: metas.proteina_g,
        delta_semana_pct: deltaPct,
      }).catch(() => 'Continue assim, uma refeição de cada vez! 💚');

      const mensagem = formatarMensagemRelatorio({
        nomePaciente: String(p.nome),
        dataInicio: inicioSemanaAtual,
        dataFim: fimSemanaAtual,
        dias: diasAtual,
        metas,
        mediaAtual,
        mediaAnterior,
        streak,
        incentivo,
      });

      await sendText(String(p.whatsapp), mensagem);
      console.log(`[relatorio] Relatorio enviado para ${p.nome}`);
    } catch (err) {
      console.error(`[relatorio] Erro ao processar paciente ${p.nome}:`, err);
    }
  }

  console.log('[relatorio] Relatorio semanal concluido');
}
