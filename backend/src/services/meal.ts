import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { query as ragQuery } from './rag';
import { sendText } from './evolution';
import { getEstado as getEstadoConv, atualizarEstado, UltimaRefeicao } from './conversation';
import type { PacienteInfo } from './conversation';
import { obterMetas, MacrosDiarios } from './calculos';
import { hojeLocal, diaAnterior, diasAtrasLocal } from '../utils/datas';
import { comBackoff } from '../utils/retry';

// Janela em que uma refeição recente ainda aceita "correção" — fora dela vira registro novo.
export const TTL_ULTIMA_REFEICAO_MIN = 60;

const MSG_ERRO_HUMANA = '😅 Tá um pouco lento aqui do meu lado agora. Me manda de novo em uns 30s?';

// Overload/timeout pede espera maior — retry em 5s só bateria 429 de novo.
export function mensagemErroHumana(err: unknown): string {
  const e = err as { status?: number; response?: { status?: number }; code?: string };
  const status = e?.status ?? e?.response?.status;
  const code = e?.code;
  const sobrecarga =
    status === 429 ||
    status === 529 ||
    status === 503 ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED';
  if (sobrecarga) return '😅 Meu servidor tá cheio agora. Tenta em 1-2 minutos.';
  return MSG_ERRO_HUMANA;
}

// Dica visual pra pergunta "quantas gramas de X?" — não é tabela nutricional.
// Keys sem acento pra casar com input normalizado.
const PESOS_TIPICOS: Record<string, { media: number; exemplo: string }> = {
  banana:    { media: 120, exemplo: '1 unidade' },
  maca:      { media: 180, exemplo: '1 unidade' },
  laranja:   { media: 130, exemplo: '1 unidade' },
  mamao:     { media: 150, exemplo: '1 fatia' },
  melancia:  { media: 150, exemplo: '1 fatia' },
  abacaxi:   { media: 120, exemplo: '1 fatia' },
  morango:   { media: 100, exemplo: '~6 unidades' },
  arroz:     { media: 100, exemplo: '4 colheres de sopa' },
  feijao:    { media: 60,  exemplo: '1 concha pequena' },
  macarrao:  { media: 80,  exemplo: 'peso seco (1 pegador)' },
  pao:       { media: 50,  exemplo: '1 pão francês' },
  ovo:       { media: 50,  exemplo: '1 unidade' },
  frango:    { media: 150, exemplo: '1 filé médio' },
  carne:     { media: 150, exemplo: '1 bife médio' },
  peixe:     { media: 150, exemplo: '1 filé médio' },
  batata:    { media: 100, exemplo: '1 unidade média' },
  queijo:    { media: 30,  exemplo: '1 fatia' },
  iogurte:   { media: 170, exemplo: '1 pote' },
  leite:     { media: 200, exemplo: '1 copo (200ml)' },
  suco:      { media: 200, exemplo: '1 copo (200ml)' },
  cafe:      { media: 100, exemplo: '1 xícara' },
  aveia:     { media: 30,  exemplo: '2 colheres de sopa' },
  granola:   { media: 30,  exemplo: '2 colheres de sopa' },
  tomate:    { media: 100, exemplo: '1 unidade média' },
  cenoura:   { media: 60,  exemplo: '1 pequena' },
  brocolis:  { media: 80,  exemplo: '1 porção pequena' },
};

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Usa contains (não equal) — "Batata frita" bate com "batata".
function dicaPesoTipico(nome: string): string {
  const alvo = semAcento(nome);
  for (const [key, info] of Object.entries(PESOS_TIPICOS)) {
    if (alvo.includes(key)) return ` (ex: ${info.exemplo} ≈ ${info.media}g)`;
  }
  return '';
}

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export interface MacrosRefeicao {
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
  agua_ml?: number;
}

// `material` distingue alimento substancial de aditivo/bebida zero (só material sem
// quantidade dispara pergunta). `preparo_inferido` marca quando o Haiku escolheu o preparo
// sozinho — opcional pra compat com analises persistidas antes do campo existir.
export interface ItemRefeicao {
  nome: string;
  quantidade_g: number;
  quantidade_informada: boolean;
  material: boolean;
  preparo_inferido?: boolean;
}

// O Haiku pode identificar várias refeições numa mensagem — sempre retorna array (mesmo com 1).
export interface RefeicaoIndividual {
  tipo_refeicao?: string;
  itens: ItemRefeicao[];
  totais: MacrosRefeicao;
}

export interface AnaliseRefeicao {
  refeicoes: RefeicaoIndividual[];
  itens: ItemRefeicao[];
  totais: MacrosRefeicao;
}

const TIPOS_REFEICAO_VALIDOS = new Set<string>([
  'café da manhã',
  'lanche da manhã',
  'almoço',
  'lanche da tarde',
  'jantar',
  'ceia',
]);

function extrairJSON(texto: string): unknown {
  const limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(limpo);
}

function sanitizarMacros(m: MacrosRefeicao): MacrosRefeicao {
  const san = (v: number) => (isNaN(v) || v < 0 ? 0 : Math.min(v, 9999));
  return { kcal: san(m.kcal), proteina_g: san(m.proteina_g), carbo_g: san(m.carbo_g), gordura_g: san(m.gordura_g) };
}

function normalizarItens(raw: unknown): ItemRefeicao[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((i) => {
    const it = i as Record<string, unknown>;
    return {
      nome: typeof it['nome'] === 'string' ? (it['nome'] as string) : 'item',
      quantidade_g: Number(it['quantidade_g']) || 0,
      quantidade_informada: it['quantidade_informada'] === true,
      material: it['material'] === true,
      preparo_inferido: it['preparo_inferido'] === true,
    };
  });
}

function macrosDeRaw(raw: unknown): MacrosRefeicao {
  const r = (raw ?? {}) as Record<string, unknown>;
  return sanitizarMacros({
    kcal:       Number(r['kcal'])       || 0,
    proteina_g: Number(r['proteina_g']) || 0,
    carbo_g:    Number(r['carbo_g'])    || 0,
    gordura_g:  Number(r['gordura_g'])  || 0,
  });
}

function agregarMacros(lista: MacrosRefeicao[]): MacrosRefeicao {
  const soma = lista.reduce(
    (acc, m) => ({
      kcal:       acc.kcal       + m.kcal,
      proteina_g: acc.proteina_g + m.proteina_g,
      carbo_g:    acc.carbo_g    + m.carbo_g,
      gordura_g:  acc.gordura_g  + m.gordura_g,
    }),
    { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 },
  );
  return sanitizarMacros(soma);
}

// Parser aceita shape legada `{itens, totais}` — embrulha em 1 refeição — pra não quebrar fixtures.
export async function analisarRefeicaoComClaude(descricao: string): Promise<AnaliseRefeicao> {
  const prompt = `Você é um assistente nutricional. Analise a mensagem do paciente e devolva as refeições que ele descreveu.

Mensagem: "${descricao}"

RESPONDA APENAS COM JSON VÁLIDO no formato:
{
  "refeicoes": [
    {
      "tipo_refeicao": "café da manhã" | "lanche da manhã" | "almoço" | "lanche da tarde" | "jantar" | "ceia" | null,
      "itens": [
        {
          "nome": "nome curto do alimento (ex.: 'Frango grelhado', 'Arroz branco', 'Coca Zero')",
          "quantidade_g": numero em gramas (ou ml para liquidos),
          "quantidade_informada": true se o paciente disse a quantidade EXPLICITA (ex.: '200g', '100ml', '2 colheres'); false se você teve que estimar,
          "material": true para alimentos substanciais que contribuem com macros (carnes, arroz, feijao, frutas, paes); false para itens sem macros relevantes (agua, cafe preto, refrigerante zero, sal, tempero, chá sem açúcar),
          "preparo_inferido": true se o alimento tem modo de preparo que muda os macros (frito/cozido/assado/grelhado/mexido) e o paciente NÃO disse qual foi — ou seja, você escolheu o preparo sozinho; false se o paciente informou o preparo OU o alimento não tem preparo relevante (fruta, iogurte, pão)
        }
      ],
      "totais": {"kcal": number, "proteina_g": number, "carbo_g": number, "gordura_g": number}
    }
  ]
}

Regras OBRIGATÓRIAS:
- Sempre retorne "refeicoes" como array, mesmo com uma única refeição.
- Separe em MÚLTIPLAS refeições quando o paciente citou explicitamente marcadores diferentes (ex.: "café: X. almoço: Y. janta: Z" → 3 refeições). Se ele descreveu tudo junto como uma refeição só, retorne 1.
- "tipo_refeicao" só recebe valor quando o paciente marcou explicitamente. Se ele só disse "comi X", use null — NÃO invente o tipo.
- Para cada item, gere uma entrada em "itens".
- Use porção típica brasileira ao estimar (ex.: arroz médio ~100g, colher de feijão ~60g, fatia de pão ~30g).
- "quantidade_informada" deve ser true APENAS quando o paciente deu um número explícito (gramas, ml, colheres, fatias, unidades). Se ele só falou "com arroz", marque false.
- "material" diferencia o que tem caloria real do que é bebida zero ou tempero — bebida zero, agua, café preto, chá sem açúcar e temperos são SEMPRE material:false.
- "preparo_inferido" só é true quando VOCÊ assumiu o preparo por conta própria: "batata frita" → false (paciente informou); "batata" → true (você escolheu). Ao assumir um preparo, use o mais comum no nome (ex.: "Batata cozida", "Frango grelhado", "Ovo cozido").
- "totais" de cada refeição deve ser a SOMA exata dos macros dos itens dessa refeição.
- Não inclua comentários ou markdown. Apenas JSON puro.

Exemplo 1 — uma refeição sem tipo marcado:
Entrada: "comi 200g de frango com arroz"
Saída:
{"refeicoes":[{"tipo_refeicao":null,"itens":[{"nome":"Frango grelhado","quantidade_g":200,"quantidade_informada":true,"material":true,"preparo_inferido":true},{"nome":"Arroz branco","quantidade_g":100,"quantidade_informada":false,"material":true,"preparo_inferido":false}],"totais":{"kcal":460,"proteina_g":50,"carbo_g":28,"gordura_g":8}}]}

Exemplo 2 — três refeições com tipos marcados:
Entrada: "café: 2 ovos e um pão. almoço: 200g de frango e arroz. janta: salada"
Saída:
{"refeicoes":[{"tipo_refeicao":"café da manhã","itens":[{"nome":"Ovo cozido","quantidade_g":100,"quantidade_informada":true,"material":true,"preparo_inferido":true},{"nome":"Pão francês","quantidade_g":50,"quantidade_informada":true,"material":true,"preparo_inferido":false}],"totais":{"kcal":275,"proteina_g":18,"carbo_g":29,"gordura_g":10}},{"tipo_refeicao":"almoço","itens":[{"nome":"Frango grelhado","quantidade_g":200,"quantidade_informada":true,"material":true,"preparo_inferido":true},{"nome":"Arroz branco","quantidade_g":100,"quantidade_informada":false,"material":true,"preparo_inferido":false}],"totais":{"kcal":460,"proteina_g":50,"carbo_g":28,"gordura_g":8}},{"tipo_refeicao":"jantar","itens":[{"nome":"Salada verde","quantidade_g":150,"quantidade_informada":false,"material":true,"preparo_inferido":false}],"totais":{"kcal":30,"proteina_g":2,"carbo_g":5,"gordura_g":0}}]}`;

  const response = await comBackoff(() =>
    claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  );

  const texto = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const raw = extrairJSON(texto) as {
      refeicoes?: unknown;
      itens?: unknown;    // legacy
      totais?: unknown;   // legacy
    };

    let refeicoes: RefeicaoIndividual[];
    if (Array.isArray(raw.refeicoes)) {
      refeicoes = raw.refeicoes.map((r) => {
        const rObj = (r ?? {}) as Record<string, unknown>;
        const tipoRaw = typeof rObj['tipo_refeicao'] === 'string' ? (rObj['tipo_refeicao'] as string) : null;
        const tipo = tipoRaw && TIPOS_REFEICAO_VALIDOS.has(tipoRaw) ? tipoRaw : undefined;
        const itens = normalizarItens(rObj['itens']);
        const totais = rObj['totais'] !== undefined
          ? macrosDeRaw(rObj['totais'])
          : agregarMacros([{ kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 }]);
        return { tipo_refeicao: tipo, itens, totais };
      });
    } else {
      refeicoes = [{
        tipo_refeicao: undefined,
        itens: normalizarItens(raw.itens),
        totais: macrosDeRaw(raw.totais),
      }];
    }

    const itensFlat = refeicoes.flatMap((r) => r.itens);
    const totaisAgregados = agregarMacros(refeicoes.map((r) => r.totais));
    return { refeicoes, itens: itensFlat, totais: totaisAgregados };
  } catch {
    console.error('[meal] Claude retornou JSON inválido para analise estruturada:', texto);
    return {
      refeicoes: [],
      itens: [],
      totais: { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 },
    };
  }
}

export async function calcularMacrosComClaude(descricao: string): Promise<MacrosRefeicao> {
  const { totais } = await analisarRefeicaoComClaude(descricao);
  return totais;
}

export function detectarItemMaterialSemQuantidade(itens: ItemRefeicao[]): ItemRefeicao | null {
  return itens.find((i) => i.material && !i.quantidade_informada) ?? null;
}

// Alimentos cujo preparo muda muito a kcal (batata frita ~310 vs cozida ~80).
// Só esses justificam interromper o registro pra perguntar o preparo.
const PREPARO_CRITICO: RegExp[] = [
  /\bbatatas?\b/,
  /\bfrango\b/,
  /\bovos?\b/,
  /\bpeixes?\b/,
  /\bcarnes?\s+moidas?\b/,
];

function normalizarNome(nome: string): string {
  return nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function ehPreparoCritico(nome: string): boolean {
  const n = normalizarNome(nome);
  return PREPARO_CRITICO.some((re) => re.test(n));
}

// Remove adjetivo de preparo pra pergunta não sair "Como foi o preparo de *Batata cozida*?".
function nomeSemPreparo(nome: string): string {
  return nome
    .replace(/\b(frit[oa]s?|cozid[oa]s?|assad[oa]s?|grelhad[oa]s?|empanad[oa]s?|mexid[oa]s?|refogad[oa]s?|ao\s+forno)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectarItemPreparoInferido(itens: ItemRefeicao[]): ItemRefeicao | null {
  return itens.find((i) => i.material && i.preparo_inferido === true && ehPreparoCritico(i.nome)) ?? null;
}

// Retorna snapshot que vira `ultima_refeicao` em entrevista_dados (base do fluxo de correção).
export async function registrarRefeicao(
  pacienteId: string,
  descricao: string,
  macros: MacrosRefeicao,
  tipoRegistro: 'texto' | 'audio' | 'foto' | 'codigo_barras' | 'rotulo',
  itens?: UltimaRefeicao['itens'],
): Promise<UltimaRefeicao> {
  const m = sanitizarMacros(macros);
  const hoje = hojeLocal();

  const { data: inserted, error: insertError } = await supabase
    .from('refeicoes')
    .insert({
      paciente_id: pacienteId,
      descricao,
      kcal: m.kcal,
      proteina_g: m.proteina_g,
      carbo_g: m.carbo_g,
      gordura_g: m.gordura_g,
      tipo_registro: tipoRegistro,
    })
    .select('id, registrado_em')
    .single();
  if (insertError || !inserted) throw new Error(`[meal] Falha ao inserir refeição: ${insertError?.message ?? 'sem dado retornado'}`);

  // Acumulação incremental via RPC — upsert direto sobrescreveria em vez de somar.
  const { error: rpcError } = await supabase.rpc('acumular_registro_diario', {
    p_paciente_id: pacienteId,
    p_data: hoje,
    p_kcal: m.kcal,
    p_proteina_g: m.proteina_g,
    p_carbo_g: m.carbo_g,
    p_gordura_g: m.gordura_g,
  });
  if (rpcError) throw new Error(`[meal] Falha ao acumular saldo: ${rpcError.message}`);

  const ultima: UltimaRefeicao = {
    id: inserted.id as string,
    descricao,
    macros: m,
    itens,
    registrado_em: (inserted.registrado_em as string) ?? new Date().toISOString(),
  };

  // Try/catch isolado: falha aqui não pode derrubar a confirmação do registro.
  try {
    await atualizarEstado(pacienteId, { dados: { ultima_refeicao: ultima } as Parameters<typeof atualizarEstado>[1]['dados'] });
  } catch (err) {
    console.error('[meal] Falha ao persistir ultima_refeicao no estado:', err);
  }

  return ultima;
}

export function obterUltimaRefeicaoSeRecente(
  dadosEstado: Record<string, unknown>,
): UltimaRefeicao | null {
  const raw = dadosEstado['ultima_refeicao'] as UltimaRefeicao | null | undefined;
  if (!raw || !raw.id || !raw.registrado_em) return null;
  const idadeMs = Date.now() - new Date(raw.registrado_em).getTime();
  if (idadeMs > TTL_ULTIMA_REFEICAO_MIN * 60 * 1000) return null;
  return raw;
}

// UPDATE em `refeicoes` + delta em `registros_diarios` via RPC (GREATEST(0, ...) evita saldo negativo).
// Sobrescreve `ultima_refeicao` pra permitir correções em cadeia.
export async function corrigirUltimaRefeicao(
  pacienteId: string,
  ultima: UltimaRefeicao,
  novaDescricao: string,
  novosMacros: MacrosRefeicao,
  novosItens?: UltimaRefeicao['itens'],
): Promise<UltimaRefeicao> {
  const novos = sanitizarMacros(novosMacros);
  const hoje = hojeLocal();

  const { error: updateError } = await supabase
    .from('refeicoes')
    .update({
      descricao: novaDescricao,
      kcal: novos.kcal,
      proteina_g: novos.proteina_g,
      carbo_g: novos.carbo_g,
      gordura_g: novos.gordura_g,
    })
    .eq('id', ultima.id)
    .eq('paciente_id', pacienteId);
  if (updateError) throw new Error(`[meal] Falha ao atualizar refeição: ${updateError.message}`);

  const dKcal     = novos.kcal       - ultima.macros.kcal;
  const dProteina = novos.proteina_g - ultima.macros.proteina_g;
  const dCarbo    = novos.carbo_g    - ultima.macros.carbo_g;
  const dGordura  = novos.gordura_g  - ultima.macros.gordura_g;

  const { error: rpcError } = await supabase.rpc('corrigir_registro_diario', {
    p_paciente_id: pacienteId,
    p_data: hoje,
    p_delta_kcal: dKcal,
    p_delta_proteina_g: dProteina,
    p_delta_carbo_g: dCarbo,
    p_delta_gordura_g: dGordura,
  });
  if (rpcError) throw new Error(`[meal] Falha ao corrigir saldo: ${rpcError.message}`);

  const atualizada: UltimaRefeicao = {
    id: ultima.id,
    descricao: novaDescricao,
    macros: novos,
    itens: novosItens ?? ultima.itens,
    registrado_em: ultima.registrado_em,
  };

  try {
    await atualizarEstado(pacienteId, { dados: { ultima_refeicao: atualizada } as Parameters<typeof atualizarEstado>[1]['dados'] });
  } catch (err) {
    console.error('[meal] Falha ao atualizar ultima_refeicao apos correcao:', err);
  }

  return atualizada;
}

export async function obterSaldoDia(pacienteId: string): Promise<MacrosRefeicao> {
  const hoje = hojeLocal();
  const { data, error } = await supabase
    .from('registros_diarios')
    .select('kcal_consumido, proteina_g, carbo_g, gordura_g, agua_ml')
    .eq('paciente_id', pacienteId)
    .eq('data', hoje)
    .maybeSingle();

  if (error || !data) return { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0, agua_ml: 0 };
  return {
    kcal:       Number(data.kcal_consumido),
    proteina_g: Number(data.proteina_g),
    carbo_g:    Number(data.carbo_g),
    gordura_g:  Number(data.gordura_g),
    agua_ml:    Number(data.agua_ml ?? 0),
  };
}

// Água fica de fora do streak de propósito — quebra fácil demais vira frustração.
export type StreakInfo = {
  proteina: number;
  kcal: number;
  batendo_hoje_proteina: boolean;
  batendo_hoje_kcal: boolean;
};

// >= 95% da meta conta como "batida". Kcal tem teto OVERSHOOT_THRESHOLD (110%).
export const STREAK_TOLERANCIA = 0.95;

// Streak acima disso satura — aceitável, mensagem perde precisão só para quem já está há um mês perfeito.
export const STREAK_JANELA_DIAS = 30;

// Regras:
// - Hoje ainda em andamento não quebra streak (só se JÁ estourou 110% de kcal).
// - Gap >= 1 dia no meio quebra.
// - Dimensão sem meta cadastrada (<= 0) fica em 0.
export async function calcularStreak(
  pacienteId: string,
  metas: MacrosDiarios,
): Promise<StreakInfo> {
  const zero: StreakInfo = { proteina: 0, kcal: 0, batendo_hoje_proteina: false, batendo_hoje_kcal: false };
  const temMetaProteina = metas.proteina_g > 0;
  const temMetaKcal = metas.kcal > 0;
  if (!temMetaProteina && !temMetaKcal) return zero;

  const hoje = hojeLocal();
  const inicioJanela = diasAtrasLocal(STREAK_JANELA_DIAS);

  const { data, error } = await supabase
    .from('registros_diarios')
    .select('data, kcal_consumido, proteina_g')
    .eq('paciente_id', pacienteId)
    .gte('data', inicioJanela)
    .order('data', { ascending: false });

  if (error || !data || data.length === 0) return zero;

  type Dia = { kcal: number; proteina: number };
  const porData = new Map<string, Dia>();
  for (const r of data) {
    porData.set(String(r.data), {
      kcal: Number(r.kcal_consumido) || 0,
      proteina: Number(r.proteina_g) || 0,
    });
  }

  const bateuProteina = (d: Dia) => temMetaProteina && d.proteina >= STREAK_TOLERANCIA * metas.proteina_g;
  const bateuKcal = (d: Dia) =>
    temMetaKcal &&
    d.kcal >= STREAK_TOLERANCIA * metas.kcal &&
    d.kcal <= OVERSHOOT_THRESHOLD * metas.kcal;
  const estourouKcal = (d: Dia) => temMetaKcal && d.kcal > OVERSHOOT_THRESHOLD * metas.kcal;

  const contar = (
    bateu: (d: Dia) => boolean,
    quebrouHoje?: (d: Dia) => boolean,
  ): { streak: number; batendoHoje: boolean } => {
    const registroHoje = porData.get(hoje);
    const batendoHoje = registroHoje !== undefined && bateu(registroHoje);
    if (registroHoje && !batendoHoje && quebrouHoje?.(registroHoje)) {
      return { streak: 0, batendoHoje: false };
    }
    let streak = batendoHoje ? 1 : 0;
    let cursor = diaAnterior(hoje);
    for (let i = 0; i < STREAK_JANELA_DIAS; i++) {
      const dia = porData.get(cursor);
      if (!dia || !bateu(dia)) break;
      streak++;
      cursor = diaAnterior(cursor);
    }
    return { streak, batendoHoje };
  };

  const prot = contar(bateuProteina);
  const kcal = contar(bateuKcal, estourouKcal);
  return {
    proteina: prot.streak,
    kcal: kcal.streak,
    batendo_hoje_proteina: prot.batendoHoje,
    batendo_hoje_kcal: kcal.batendoHoje,
  };
}

// Streak == 1 só aparece se bateu HOJE — evita otimismo quando só bateu ontem.
// Empate entre dimensões vai pra proteína.
export function linhaStreak(streak?: StreakInfo): string {
  if (!streak) return '';
  const melhor = streak.proteina >= streak.kcal
    ? { dias: streak.proteina, alvo: 'a proteína', batendoHoje: streak.batendo_hoje_proteina }
    : { dias: streak.kcal, alvo: 'a meta de calorias', batendoHoje: streak.batendo_hoje_kcal };
  if (melhor.dias >= 2) {
    const sufixo = melhor.batendoHoje ? '' : ' Vamos pro próximo?';
    return `🔥 *${melhor.dias} dias seguidos batendo ${melhor.alvo}!*${sufixo}`;
  }
  if (melhor.dias === 1 && melhor.batendoHoje) {
    return `🌱 *1º dia batendo ${melhor.alvo}!* Amanha a gente mantém.`;
  }
  return '';
}

// Aviso amigável a partir de 110% da meta calórica.
export const OVERSHOOT_THRESHOLD = 1.10;

export function excedeuMetaKcal(saldo: MacrosRefeicao, metas: MacrosDiarios): boolean {
  if (!metas.kcal || metas.kcal <= 0) return false;
  return saldo.kcal > metas.kcal * OVERSHOOT_THRESHOLD;
}

// Try/catch isolado — falha de notificação não derruba o registro da refeição.
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

// Satura em 100% quando passa da meta — a ultrapassagem sai na micro-mensagem final.
export function barraProgresso(atual: number, meta: number, blocos = 10): string {
  if (meta <= 0 || atual <= 0) return '▱'.repeat(blocos);
  const proporcao = Math.min(atual / meta, 1);
  const cheios = Math.round(proporcao * blocos);
  return '▰'.repeat(cheios) + '▱'.repeat(blocos - cheios);
}

// Estados: ultrapassou (>110%) | perto_limite (103-110%) | bateu (95-102% + proteína ok)
// | perto (>=85%) | abaixo (destaca proteína se faltar >30%).
export function microMensagemFinal(saldo: MacrosRefeicao, metas: MacrosDiarios, streak?: StreakInfo): string {
  const base = microMensagemBase(saldo, metas);
  const fogo = linhaStreak(streak);
  if (!fogo) return base;
  return base ? `${fogo}\n${base}` : fogo;
}

function microMensagemBase(saldo: MacrosRefeicao, metas: MacrosDiarios): string {
  const kcalAtual = saldo.kcal;
  const kcalMeta = metas.kcal;
  const protAtual = saldo.proteina_g;
  const protMeta = metas.proteina_g;
  if (kcalMeta <= 0) return '';

  const ratioKcal = kcalAtual / kcalMeta;
  const ratioProt = protMeta > 0 ? protAtual / protMeta : 1;

  if (ratioKcal > 1.10) {
    const excesso = Math.round(kcalAtual - kcalMeta);
    return `_Você passou *${excesso} kcal* da meta hoje — sem problema, amanhã equilibra. 👍_`;
  }
  if (ratioKcal > 1.02) {
    const excesso = Math.round(kcalAtual - kcalMeta);
    return `🎯 _Meta batida — passou *${excesso} kcal* da meta, ainda dentro da margem. 👍_`;
  }
  if (ratioKcal >= 0.95 && ratioProt >= 1.0) {
    return `🎯 *Meta do dia batida!* Mandou bem.`;
  }
  if (ratioKcal >= 0.85) {
    const faltam = Math.max(0, Math.round(kcalMeta - kcalAtual));
    return `🔥 Reta final — faltam *${faltam} kcal* pra fechar o dia.`;
  }
  const faltamKcal = Math.max(0, Math.round(kcalMeta - kcalAtual));
  const faltamProt = Math.max(0, Math.round(protMeta - protAtual));
  if (ratioProt < 0.70 && faltamProt > 0) {
    return `💪 Faltam *${faltamProt}g de proteína* e *${faltamKcal} kcal* pra fechar o dia. Tá indo bem!`;
  }
  return `💪 Faltam *${faltamKcal} kcal* pra fechar o dia. Tá indo bem!`;
}

// Linha de água só aparece quando `metas.agua_ml` está cadastrado (calculado a partir do peso).
export function formatarBlocoProgressoDia(saldo: MacrosRefeicao, metas: MacrosDiarios, streak?: StreakInfo): string {
  const linhas = [
    `🔥 Energia    ${barraProgresso(saldo.kcal, metas.kcal)}  ${Math.round(saldo.kcal)} / ${Math.round(metas.kcal)} kcal`,
    `🍗 Proteína   ${barraProgresso(saldo.proteina_g, metas.proteina_g)}  ${Math.round(saldo.proteina_g)} / ${Math.round(metas.proteina_g)} g`,
    `🍚 Carbo      ${barraProgresso(saldo.carbo_g, metas.carbo_g)}  ${Math.round(saldo.carbo_g)} / ${Math.round(metas.carbo_g)} g`,
    `🥑 Gordura    ${barraProgresso(saldo.gordura_g, metas.gordura_g)}  ${Math.round(saldo.gordura_g)} / ${Math.round(metas.gordura_g)} g`,
  ];
  if (metas.agua_ml && metas.agua_ml > 0) {
    const aguaAtual = saldo.agua_ml ?? 0;
    linhas.push(
      `💧 Água       ${barraProgresso(aguaAtual, metas.agua_ml)}  ${Math.round(aguaAtual)} / ${Math.round(metas.agua_ml)} ml`,
    );
  }
  const micro = microMensagemFinal(saldo, metas, streak);
  return `📊 *Seu dia até agora*\n${linhas.join('\n')}${micro ? `\n\n${micro}` : ''}`;
}

export function formatarSaldoDia(
  descricao: string,
  kcalRegistrado: number,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
  streak?: StreakInfo,
): string {
  return (
    `✅ *Registrado:* ${descricao} (${Math.round(kcalRegistrado)} kcal)\n\n` +
    formatarBlocoProgressoDia(saldo, metas, streak)
  );
}

// Itens não-materiais (coca zero, água, café) viram rodapé leve "+ X".
export function formatarCardRefeicao(
  analise: AnaliseRefeicao,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
  streak?: StreakInfo,
): string {
  const materiais = analise.itens.filter((i) => i.material);
  const naoMateriais = analise.itens.filter((i) => !i.material);

  const linhasItens = materiais.map((i) => {
    const qtd = Math.round(i.quantidade_g);
    // "~" é exclusivo de quantidade estimada; preparo assumido em item crítico só marca "_(estimei)_".
    const estimou = !i.quantidade_informada || (i.preparo_inferido === true && ehPreparoCritico(i.nome));
    const marcador = estimou ? ' _(estimei)_' : '';
    const prefixo = i.quantidade_informada ? '' : '~';
    return `• ${i.nome} — ${prefixo}${qtd}g${marcador}`;
  });

  const rodapeExtras = naoMateriais.length > 0
    ? `\n_+ ${naoMateriais.map((i) => i.nome).join(', ')}_`
    : '';

  const t = analise.totais;
  const linhaRefeicao =
    `_Essa refeição:_ ${Math.round(t.kcal)} kcal · ` +
    `${Math.round(t.proteina_g)}g P · ${Math.round(t.carbo_g)}g C · ${Math.round(t.gordura_g)}g G`;

  return (
    `✅ *Registrado!*\n\n` +
    `${linhasItens.join('\n')}${rodapeExtras}\n\n` +
    `${linhaRefeicao}\n\n` +
    formatarBlocoProgressoDia(saldo, metas, streak)
  );
}

// Formato: "almoço: 200g de Frango, 100g de Arroz". Sem itens materiais cai pra lista completa.
function descricaoRefeicao(r: RefeicaoIndividual): string {
  const materiais = r.itens.filter((i) => i.material);
  const base = materiais.length > 0 ? materiais : r.itens;
  const partes = base.map((i) => `${Math.round(i.quantidade_g)}g de ${i.nome}`).join(', ');
  const prefixo = r.tipo_refeicao ? `${r.tipo_refeicao}: ` : '';
  return partes ? `${prefixo}${partes}` : (r.tipo_refeicao ?? 'refeição');
}

// Marcador "_(estimei)_" por item poluiria demais em batch — vai concentrado no rodapé.
function resumoEstimativasBatch(analise: AnaliseRefeicao): string {
  const preparosEstimados: string[] = [];
  const qtdsEstimadas: string[] = [];
  const vistoPreparo = new Set<string>();
  const vistoQtd = new Set<string>();

  for (const r of analise.refeicoes) {
    for (const i of r.itens) {
      if (!i.material) continue;
      if (i.preparo_inferido === true && ehPreparoCritico(i.nome) && !vistoPreparo.has(i.nome)) {
        preparosEstimados.push(i.nome);
        vistoPreparo.add(i.nome);
      }
      if (!i.quantidade_informada && !vistoQtd.has(i.nome)) {
        qtdsEstimadas.push(`${i.nome} (${Math.round(i.quantidade_g)}g)`);
        vistoQtd.add(i.nome);
      }
    }
  }
  if (preparosEstimados.length === 0 && qtdsEstimadas.length === 0) return '';

  const partes: string[] = [];
  if (preparosEstimados.length > 0) {
    const lista = preparosEstimados.join(', ');
    partes.push(preparosEstimados.length === 1 ? `o preparo de ${lista}` : `os preparos de ${lista}`);
  }
  if (qtdsEstimadas.length > 0) {
    const lista = qtdsEstimadas.join(', ');
    partes.push(qtdsEstimadas.length === 1 ? `a quantidade de ${lista}` : `as quantidades de ${lista}`);
  }
  return `_Estimei ${partes.join(' e ')}. Se algo estiver muito fora, me manda a correção._`;
}

export function formatarCardMultiplo(
  analise: AnaliseRefeicao,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
  streak?: StreakInfo,
): string {
  const emojiPorTipo: Record<string, string> = {
    'café da manhã': '☕',
    'lanche da manhã': '🍎',
    'almoço': '🍽️',
    'lanche da tarde': '🍎',
    'jantar': '🍽️',
    'ceia': '🌙',
  };
  const blocos = analise.refeicoes.map((r) => {
    const titulo = r.tipo_refeicao
      ? `${emojiPorTipo[r.tipo_refeicao] ?? '🍴'} *${r.tipo_refeicao}* (${Math.round(r.totais.kcal)} kcal)`
      : `🍴 *Refeição* (${Math.round(r.totais.kcal)} kcal)`;
    const itensMat = r.itens.filter((i) => i.material);
    const linhas = itensMat.map((i) => `  • ${i.nome} — ${Math.round(i.quantidade_g)}g`);
    return linhas.length > 0 ? `${titulo}\n${linhas.join('\n')}` : titulo;
  }).join('\n\n');

  const t = analise.totais;
  const linhaTotal =
    `_Total das refeições:_ ${Math.round(t.kcal)} kcal · ` +
    `${Math.round(t.proteina_g)}g P · ${Math.round(t.carbo_g)}g C · ${Math.round(t.gordura_g)}g G`;

  const resumo = resumoEstimativasBatch(analise);
  const blocoResumo = resumo ? `\n\n${resumo}` : '';

  return (
    `✅ *${analise.refeicoes.length} refeições registradas!*\n\n` +
    `${blocos}\n\n` +
    `${linhaTotal}${blocoResumo}\n\n` +
    formatarBlocoProgressoDia(saldo, metas, streak)
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

// Falha no meio não rebobina as anteriores — perder registro parcial é pior que card incompleto.
// Fluxos de pergunta de preparo/quantidade DESLIGADOS aqui por design.
async function processarBatch(
  phone: string,
  paciente: PacienteInfo,
  analise: AnaliseRefeicao,
): Promise<void> {
  for (const r of analise.refeicoes) {
    const descricao = descricaoRefeicao(r);
    await registrarRefeicao(paciente.id, descricao, r.totais, 'texto', stripMaterial(r.itens));
  }

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);
  const streak = await calcularStreak(paciente.id, metas);

  await sendText(phone, formatarCardMultiplo(analise, saldo, metas, streak));
  await dispararAlertaOvershoot(phone, saldo, metas);
}

// Quando `intentHint` vem, os regexes internos NÃO re-decidem — eles são mais burros
// que o classificador e derrubam mensagem válida em silêncio.
export async function processarTextoRefeicao(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
  intentHint?: 'registrar' | 'substituicao',
): Promise<void> {
  const textoLower = texto.toLowerCase();

  const ehSubstituicao = intentHint
    ? intentHint === 'substituicao'
    : /substitu|nao tenho|não tenho|alternativa|trocar|troca/.test(textoLower);
  if (ehSubstituicao) {
    const resposta = await sugerirSubstituicao(paciente.id, paciente.nome, texto);
    await sendText(phone, resposta);
    return;
  }

  const ehRegistro = intentHint === 'registrar' ||
    /comi|tomei|bebi|almocei|jantei|caf[eé]|lanche|refeicao|refeição|breakfast|lunch|dinner|g de|ml de|colher|prato|gramas/.test(textoLower);

  if (!ehRegistro) {
    return;
  }

  let analise: AnaliseRefeicao;
  try {
    analise = await analisarRefeicaoComClaude(texto);
  } catch (e) {
    console.error('[meal] Claude falhou apos backoff em processarTextoRefeicao:', e);
    await sendText(phone, mensagemErroHumana(e));
    return;
  }

  if (analise.totais.kcal === 0 || analise.itens.length === 0) {
    await sendText(phone, `⚠️ Não consegui estimar os macros para essa refeição. Tente descrever com mais detalhes (ex: "200g de frango grelhado com 100g de arroz").`);
    return;
  }

  // 2+ refeições: registra em batch sem interromper com perguntas — interromper batch vira UX ruim.
  if (analise.refeicoes.length >= 2) {
    await processarBatch(phone, paciente, analise);
    return;
  }

  // Preparo em alimento crítico: erro de ~4x na kcal é pior que erro de porção.
  // Resposta volta pela `preparo_pendente` (intercept em agent.ts).
  const itemPreparo = detectarItemPreparoInferido(analise.itens);
  if (itemPreparo) {
    await atualizarEstado(paciente.id, {
      dados: {
        preparo_pendente: {
          descricao_original: texto,
          analise,
          item_perguntado: itemPreparo.nome,
          timestamp: new Date().toISOString(),
        },
      } as Parameters<typeof atualizarEstado>[1]['dados'],
    });
    await sendText(
      phone,
      `🍳 Como foi o preparo de *${nomeSemPreparo(itemPreparo.nome)}*? (frito, cozido, assado, grelhado...)\n\n` +
      `_Se não souber, manda *"não sei"* que eu uso o mais comum._`,
    );
    return;
  }

  // Pergunta UMA vez antes de registrar. Resposta volta pela `refeicao_pendente`.
  const itemFaltando = detectarItemMaterialSemQuantidade(analise.itens);
  if (itemFaltando) {
    await atualizarEstado(paciente.id, {
      dados: {
        refeicao_pendente: {
          descricao_original: texto,
          analise,
          item_perguntado: itemFaltando.nome,
          timestamp: new Date().toISOString(),
        },
      } as Parameters<typeof atualizarEstado>[1]['dados'],
    });
    await sendText(
      phone,
      `🤔 Quantas gramas de *${itemFaltando.nome}*${dicaPesoTipico(itemFaltando.nome)}, mais ou menos?\n\n` +
      `_Se não souber, manda *"estima"* que eu uso uma porção média._`,
    );
    return;
  }

  await registrarRefeicao(paciente.id, texto, analise.totais, 'texto', stripMaterial(analise.itens));

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);
  const streak = await calcularStreak(paciente.id, metas);

  await sendText(phone, formatarCardRefeicao(analise, saldo, metas, streak));

  await dispararAlertaOvershoot(phone, saldo, metas);
}

// Três caminhos: (a) "estima/não sei" → usa estimativa; (b) número → recalcula;
// (c) qualquer outra coisa → cai em (a) pra não prender em loop.
export async function processarRespostaQuantidade(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
  pendente: {
    descricao_original: string;
    analise: AnaliseRefeicao;
    item_perguntado: string;
  },
): Promise<void> {
  const txt = texto.toLowerCase().trim();
  const aceitarEstimativa = /^(estima|estimar|nao\s+sei|n[aã]o\s+sei|sei\s+l[aá]|qualquer|tanto\s+faz|m[eé]dia|porcao\s+m[eé]dia|por[çc][ãa]o\s+m[eé]dia)\b/.test(txt);
  const matchQtd = texto.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramas?|ml|l|litros?|copos?|colher(?:es)?|colheres|fatias?|unidades?|porc(?:o|ao|ão)es?)?/i);

  let analiseFinal = pendente.analise;
  let descricaoFinal = pendente.descricao_original;

  if (!aceitarEstimativa && matchQtd) {
    descricaoFinal = `${pendente.descricao_original} (${pendente.item_perguntado}: ${matchQtd[0]})`;
    try {
      analiseFinal = await analisarRefeicaoComClaude(descricaoFinal);
      if (analiseFinal.totais.kcal === 0 || analiseFinal.itens.length === 0) {
        analiseFinal = pendente.analise;
        descricaoFinal = pendente.descricao_original;
      }
    } catch (e) {
      console.error('[meal] Claude falhou apos backoff em processarRespostaQuantidade:', e);
      await sendText(phone, mensagemErroHumana(e));
      return;
    }
  }

  // Limpa pendência ANTES de gravar — evita mensagem nova virar continuação se algo abaixo falhar.
  await atualizarEstado(paciente.id, {
    dados: { refeicao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'],
  });

  await registrarRefeicao(paciente.id, descricaoFinal, analiseFinal.totais, 'texto', stripMaterial(analiseFinal.itens));

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);
  const streak = await calcularStreak(paciente.id, metas);
  await sendText(phone, formatarCardRefeicao(analiseFinal, saldo, metas, streak));
  await dispararAlertaOvershoot(phone, saldo, metas);
}

function stripMaterial(itens: ItemRefeicao[]): UltimaRefeicao['itens'] {
  return itens.map((i) => ({
    nome: i.nome,
    quantidade_g: i.quantidade_g,
    quantidade_informada: i.quantidade_informada,
  }));
}

export const TTL_REFEICAO_PENDENTE_MIN = 10;

export function obterRefeicaoPendenteSeValida(
  dadosEstado: Record<string, unknown>,
): {
  descricao_original: string;
  analise: AnaliseRefeicao;
  item_perguntado: string;
} | null {
  const raw = dadosEstado['refeicao_pendente'] as {
    descricao_original?: string;
    analise?: AnaliseRefeicao;
    item_perguntado?: string;
    timestamp?: string;
  } | null | undefined;
  if (!raw || !raw.descricao_original || !raw.analise || !raw.item_perguntado || !raw.timestamp) return null;
  const idadeMs = Date.now() - new Date(raw.timestamp).getTime();
  if (idadeMs > TTL_REFEICAO_PENDENTE_MIN * 60 * 1000) return null;
  return {
    descricao_original: raw.descricao_original,
    analise: raw.analise,
    item_perguntado: raw.item_perguntado,
  };
}

// Mesmo shape/TTL da refeicao_pendente, chave separada — as duas nunca coexistem.
export function obterPreparoPendenteSeValido(
  dadosEstado: Record<string, unknown>,
): {
  descricao_original: string;
  analise: AnaliseRefeicao;
  item_perguntado: string;
} | null {
  const raw = dadosEstado['preparo_pendente'] as {
    descricao_original?: string;
    analise?: AnaliseRefeicao;
    item_perguntado?: string;
    timestamp?: string;
  } | null | undefined;
  if (!raw || !raw.descricao_original || !raw.analise || !raw.item_perguntado || !raw.timestamp) return null;
  const idadeMs = Date.now() - new Date(raw.timestamp).getTime();
  if (idadeMs > TTL_REFEICAO_PENDENTE_MIN * 60 * 1000) return null;
  return {
    descricao_original: raw.descricao_original,
    analise: raw.analise,
    item_perguntado: raw.item_perguntado,
  };
}

// Uma pergunta de preparo por refeição, sem loop — depois da resposta, só a quantidade pode ser re-perguntada.
export async function processarRespostaPreparo(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
  pendente: {
    descricao_original: string;
    analise: AnaliseRefeicao;
    item_perguntado: string;
  },
): Promise<void> {
  const txt = texto.toLowerCase().trim();
  const naoSabe = /^(n[aã]o\s+sei|sei\s+l[aá]|estima|estimar|qualquer|tanto\s+faz|o\s+mais\s+comum)\b/.test(txt);

  let analiseFinal = pendente.analise;
  let descricaoFinal = pendente.descricao_original;

  if (!naoSabe) {
    descricaoFinal = `${pendente.descricao_original} (${pendente.item_perguntado}: preparo ${texto.trim()})`;
    try {
      analiseFinal = await analisarRefeicaoComClaude(descricaoFinal);
      if (analiseFinal.totais.kcal === 0 || analiseFinal.itens.length === 0) {
        analiseFinal = pendente.analise;
        descricaoFinal = pendente.descricao_original;
      }
    } catch (e) {
      console.error('[meal] Claude falhou apos backoff em processarRespostaPreparo:', e);
      await sendText(phone, mensagemErroHumana(e));
      return;
    }
  }

  // Limpa pendência ANTES de gravar — evita mensagem nova virar continuação se algo abaixo falhar.
  await atualizarEstado(paciente.id, {
    dados: { preparo_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'],
  });

  const itemFaltando = detectarItemMaterialSemQuantidade(analiseFinal.itens);
  if (itemFaltando) {
    await atualizarEstado(paciente.id, {
      dados: {
        refeicao_pendente: {
          descricao_original: descricaoFinal,
          analise: analiseFinal,
          item_perguntado: itemFaltando.nome,
          timestamp: new Date().toISOString(),
        },
      } as Parameters<typeof atualizarEstado>[1]['dados'],
    });
    await sendText(
      phone,
      `🤔 Quantas gramas de *${itemFaltando.nome}*${dicaPesoTipico(itemFaltando.nome)}, mais ou menos?\n\n` +
      `_Se não souber, manda *"estima"* que eu uso uma porção média._`,
    );
    return;
  }

  await registrarRefeicao(paciente.id, descricaoFinal, analiseFinal.totais, 'texto', stripMaterial(analiseFinal.itens));

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);
  const streak = await calcularStreak(paciente.id, metas);
  await sendText(phone, formatarCardRefeicao(analiseFinal, saldo, metas, streak));
  await dispararAlertaOvershoot(phone, saldo, metas);
}

// Mensagem final deixa explícito que foi correção (não acréscimo).
export async function processarTextoCorrecao(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
  ultima: UltimaRefeicao,
): Promise<void> {
  let novosMacros: MacrosRefeicao;
  try {
    novosMacros = await calcularMacrosComClaude(texto);
  } catch (e) {
    console.error('[meal] Claude falhou apos backoff em processarTextoCorrecao:', e);
    await sendText(phone, mensagemErroHumana(e));
    return;
  }

  if (novosMacros.kcal === 0) {
    await sendText(phone, `⚠️ Não consegui recalcular os macros pra essa correção. Tente descrever com mais detalhes (ex: "foram 200g de frango com 100g de arroz").`);
    return;
  }

  await corrigirUltimaRefeicao(paciente.id, ultima, texto, novosMacros);

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);
  const streak = await calcularStreak(paciente.id, metas);

  await sendText(
    phone,
    `✏️ *Corrigi a última refeição* (substituí, não somei).\n\n` +
    formatarSaldoDia(texto, novosMacros.kcal, saldo, metas, streak),
  );

  await dispararAlertaOvershoot(phone, saldo, metas);
}
