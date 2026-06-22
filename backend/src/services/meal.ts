import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { query as ragQuery } from './rag';
import { sendText } from './evolution';
import { getEstado as getEstadoConv } from './conversation';
import type { PacienteInfo } from './conversation';
import { obterMetas, MacrosDiarios } from './calculos';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export interface MacrosRefeicao {
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
}

function extrairJSON(texto: string): unknown {
  const limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(limpo);
}

function sanitizarMacros(m: MacrosRefeicao): MacrosRefeicao {
  const san = (v: number) => (isNaN(v) || v < 0 ? 0 : Math.min(v, 9999));
  return { kcal: san(m.kcal), proteina_g: san(m.proteina_g), carbo_g: san(m.carbo_g), gordura_g: san(m.gordura_g) };
}

export async function calcularMacrosComClaude(descricao: string): Promise<MacrosRefeicao> {
  const prompt = `Você é um assistente nutricional. Estime os macronutrientes da refeição descrita.

Refeição: "${descricao}"

RESPONDA APENAS COM JSON VÁLIDO no formato:
{"kcal": number, "proteina_g": number, "carbo_g": number, "gordura_g": number}

- Use estimativas razoáveis para a porção típica brasileira
- Se a quantidade não for especificada, assuma porção média
- Não inclua comentários ou markdown
- Apenas JSON puro`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const raw = extrairJSON(texto) as Record<string, number>;
    return sanitizarMacros({
      kcal:       Number(raw['kcal'])       || 0,
      proteina_g: Number(raw['proteina_g']) || 0,
      carbo_g:    Number(raw['carbo_g'])    || 0,
      gordura_g:  Number(raw['gordura_g'])  || 0,
    });
  } catch {
    console.error('[meal] Claude retornou JSON inválido para macros:', texto);
    return { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 };
  }
}

export async function registrarRefeicao(
  pacienteId: string,
  descricao: string,
  macros: MacrosRefeicao,
  tipoRegistro: 'texto' | 'audio' | 'foto' | 'codigo_barras' | 'rotulo',
): Promise<void> {
  const m = sanitizarMacros(macros);
  const hoje = new Date().toISOString().slice(0, 10);

  const { error: insertError } = await supabase.from('refeicoes').insert({
    paciente_id: pacienteId,
    descricao,
    kcal: m.kcal,
    proteina_g: m.proteina_g,
    carbo_g: m.carbo_g,
    gordura_g: m.gordura_g,
    tipo_registro: tipoRegistro,
  });
  if (insertError) throw new Error(`[meal] Falha ao inserir refeição: ${insertError.message}`);

  // Acumulação incremental via RPC — NUNCA usar upsert direto (sobrescreve em vez de somar)
  const { error: rpcError } = await supabase.rpc('acumular_registro_diario', {
    p_paciente_id: pacienteId,
    p_data: hoje,
    p_kcal: m.kcal,
    p_proteina_g: m.proteina_g,
    p_carbo_g: m.carbo_g,
    p_gordura_g: m.gordura_g,
  });
  if (rpcError) throw new Error(`[meal] Falha ao acumular saldo: ${rpcError.message}`);
}

export async function obterSaldoDia(pacienteId: string): Promise<MacrosRefeicao> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('registros_diarios')
    .select('kcal_consumido, proteina_g, carbo_g, gordura_g')
    .eq('paciente_id', pacienteId)
    .eq('data', hoje)
    .maybeSingle();

  if (error || !data) return { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 };
  return {
    kcal:       Number(data.kcal_consumido),
    proteina_g: Number(data.proteina_g),
    carbo_g:    Number(data.carbo_g),
    gordura_g:  Number(data.gordura_g),
  };
}

// Limite a partir do qual o paciente recebe alerta proativo de excesso calorico.
// 110% e tolerancia clinica razoavel: 100% e meta, +10% e overshoot leve digno
// de aviso amigavel (nao critico). Centralizado pra facilitar tunning futuro.
export const OVERSHOOT_THRESHOLD = 1.10;

// Pura: decide se ja passou de 110% da meta calorica do dia.
// Defensiva: meta <= 0 retorna false (sem meta cadastrada, nao alerta).
export function excedeuMetaKcal(saldo: MacrosRefeicao, metas: MacrosDiarios): boolean {
  if (!metas.kcal || metas.kcal <= 0) return false;
  return saldo.kcal > metas.kcal * OVERSHOOT_THRESHOLD;
}

// Side-effect: dispara alerta proativo se o saldo passou de 110% da meta.
// Try/catch isolado interno — falha de notificacao NAO derruba o registro
// da refeicao. Mesma filosofia do sync de alertas_config em agent.ts:443.
export async function dispararAlertaOvershoot(
  phone: string,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
): Promise<void> {
  if (!excedeuMetaKcal(saldo, metas)) return;
  try {
    const pct = Math.round((saldo.kcal / metas.kcal) * 100);
    await sendText(
      phone,
      `⚠️ Voce ja consumiu ${pct}% da sua meta calorica de hoje (${Math.round(saldo.kcal)} / ${Math.round(metas.kcal)} kcal).\n\n` +
      `Sugiro pausar a proxima refeicao ou trocar por algo mais leve. 💚`,
    );
  } catch (err) {
    console.error('[meal] Falha ao disparar alerta de overshoot:', err);
  }
}

export function formatarSaldoDia(
  descricao: string,
  kcalRegistrado: number,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
): string {
  return (
    `✅ Registrado: ${descricao} (${Math.round(kcalRegistrado)} kcal)\n\n` +
    `📊 Saldo do dia:\n` +
    `• Kcal: ${Math.round(saldo.kcal)} / ${Math.round(metas.kcal)} kcal\n` +
    `• Proteína: ${Math.round(saldo.proteina_g)}g / ${Math.round(metas.proteina_g)}g\n` +
    `• Carbo: ${Math.round(saldo.carbo_g)}g / ${Math.round(metas.carbo_g)}g\n` +
    `• Gordura: ${Math.round(saldo.gordura_g)}g / ${Math.round(metas.gordura_g)}g`
  );
}

export async function sugerirSubstituicao(
  pacienteId: string,
  pacienteNome: string,
  alimentoAusente: string,
): Promise<string> {
  const contexto = await ragQuery(pacienteId, `substituto para ${alimentoAusente}`);
  if (!contexto) {
    return `Não encontrei substitutos para "${alimentoAusente}" na sua dieta. Consulte seu nutricionista.`;
  }

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `Você é o NutriChat, assistente nutricional de ${pacienteNome}. Seu nutricionista prescreveu a dieta abaixo.`,
    messages: [{
      role: 'user',
      content: `Contexto da dieta prescrita:\n${contexto}\n\nO paciente não tem "${alimentoAusente}". Com base APENAS nos alimentos da dieta prescrita acima, sugira alternativas disponíveis. Não invente alimentos que não estão na dieta.`,
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function processarTextoRefeicao(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
): Promise<void> {
  const textoLower = texto.toLowerCase();

  const ehSubstituicao = /substitu|nao tenho|não tenho|alternativa|trocar|troca/.test(textoLower);
  if (ehSubstituicao) {
    const resposta = await sugerirSubstituicao(paciente.id, paciente.nome, texto);
    await sendText(phone, resposta);
    return;
  }

  const ehRegistro = /comi|tomei|bebi|almocei|jantei|caf[eé]|lanche|refeicao|refeição|breakfast|lunch|dinner|g de|ml de|colher|prato|gramas/.test(textoLower);

  if (!ehRegistro) {
    return;
  }

  const macros = await calcularMacrosComClaude(texto);

  if (macros.kcal === 0) {
    await sendText(phone, `⚠️ Não consegui estimar os macros para essa refeição. Tente descrever com mais detalhes (ex: "200g de frango grelhado com 100g de arroz").`);
    return;
  }

  await registrarRefeicao(paciente.id, texto, macros, 'texto');

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);

  await sendText(phone, formatarSaldoDia(texto, macros.kcal, saldo, metas));

  await dispararAlertaOvershoot(phone, saldo, metas);
}
