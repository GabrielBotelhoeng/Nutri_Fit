import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import type { ObjetivoNutricional } from './conversation';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

export interface DadosEntrevista {
  idade: number;
  sexo: 'masculino' | 'feminino';
  peso_kg: number;
  altura_cm: number;
  atividade_tipo: string;
  atividade_frequencia?: string;
  suplementos?: string[];
}

export interface MacrosDiarios {
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
  proteina_pct: number;
  carbo_pct: number;
  gordura_pct: number;
  agua_ml?: number;
}

export interface ResultadoTMB {
  tmb_kcal: number;
  tdee_kcal: number;
  fator_atividade: number;
  nivel_atividade: string;
}

export interface ResultadoHidratacao {
  meta_ml: number;
  distribuicao: string[];
}

export interface ResultadoCreatina {
  dose_g: number;
  fonte: 'calculada' | 'nutricionista';
  mensagem: string;
}

// Frequência semanal domina; tipo só orienta o default quando a frequência não está clara.
type Nivel = {
  fator: number;
  nivel: string;
};

const NIVEL_SEDENTARIO: Nivel = { fator: 1.2, nivel: 'Sedentario' };
const NIVEL_LEVE: Nivel = { fator: 1.375, nivel: 'Levemente ativo' };
const NIVEL_MODERADO: Nivel = { fator: 1.55, nivel: 'Moderadamente ativo' };
const NIVEL_MUITO_ATIVO: Nivel = { fator: 1.725, nivel: 'Muito ativo' };
const NIVEL_EXTREMO: Nivel = { fator: 1.9, nivel: 'Extremamente ativo' };

const NUMEROS_PT: Record<string, number> = {
  zero: 0,
  uma: 1, um: 1,
  duas: 2, dois: 2,
  tres: 3, três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
};

export function extrairFrequenciaSemanal(texto: string): number | null {
  const t = texto.toLowerCase();

  if (/(2|duas)\s*(x|vezes)\s*(ao|por|no)\s*dia/.test(t)) return 7;
  if (/\btodo(s)?\s+(o\s+)?dia/.test(t) || /\bdiari[oa]\b/.test(t) || /\btodos os dias\b/.test(t)) return 7;

  const matchDigito = t.match(/(\d+)\s*(x|vezes)(?:\s*(?:por|na|\/|\s)\s*(?:semana|sem))?/);
  if (matchDigito) return parseInt(matchDigito[1], 10);

  const matchSlashSemana = t.match(/(\d+)\s*\/?\s*semana/);
  if (matchSlashSemana) return parseInt(matchSlashSemana[1], 10);

  for (const [palavra, n] of Object.entries(NUMEROS_PT)) {
    const re = new RegExp(`\\b${palavra}\\s*(x|vezes)`);
    if (re.test(t)) return n;
  }

  if (/\bnao\s+(pratico|faco|faço|treino)/.test(t) || /\bnenhuma\b/.test(t) || /\bsedentari[oa]\b/.test(t)) {
    return 0;
  }

  return null;
}

type TipoAtividade = 'sedentario' | 'leve' | 'moderado' | 'intenso' | 'desconhecido';

export function classificarTipoAtividade(texto: string): TipoAtividade {
  const t = texto.toLowerCase();
  if (/\bsedentari[oa]\b/.test(t) || /\bnao\s+(pratico|faco|faço|treino)/.test(t) || /\bnenhuma\b/.test(t)) {
    return 'sedentario';
  }
  if (/\b(atletismo|atleta|crossfit|cross\s*fit|profissional|competi(c|ç)ao)\b/.test(t) || /\bintens[oa]\b/.test(t) || /\bpesad[oa]\b/.test(t)) {
    return 'intenso';
  }
  if (/\b(musculacao|musculação|corrida|correr|natacao|natação|ciclismo|bike|pedal|futebol|crossfit|treino|academia|moderad[oa])\b/.test(t)) {
    return 'moderado';
  }
  if (/\b(caminhada|caminhar|yoga|alongamento|pilates|leve)\b/.test(t)) {
    return 'leve';
  }
  return 'desconhecido';
}

// Sedentário no tipo sobrescreve frequência; senão frequência domina.
export function detectarFatorAtividade(
  atividadeTipo: string,
  frequencia?: string,
): { fator: number; nivel: string } {
  const textoTipo = atividadeTipo || '';
  const textoFreq = frequencia ?? '';
  const tipo = classificarTipoAtividade(textoTipo);

  if (tipo === 'sedentario') return NIVEL_SEDENTARIO;

  const freq = extrairFrequenciaSemanal(`${textoTipo} ${textoFreq}`);

  if (freq !== null) {
    if (freq <= 0) return NIVEL_SEDENTARIO;
    if (freq <= 2) return NIVEL_LEVE;
    if (freq <= 4) return NIVEL_MODERADO;
    if (freq <= 6) return NIVEL_MUITO_ATIVO;
    return NIVEL_EXTREMO;
  }

  switch (tipo) {
    case 'leve': return NIVEL_LEVE;
    case 'intenso': return NIVEL_MUITO_ATIVO;
    case 'moderado': return NIVEL_MODERADO;
    default: return NIVEL_MODERADO;
  }
}

// Mifflin-St Jeor
export function calcularTMB(dados: DadosEntrevista): ResultadoTMB {
  let tmb: number;
  if (dados.sexo === 'masculino') {
    tmb = 10 * dados.peso_kg + 6.25 * dados.altura_cm - 5 * dados.idade + 5;
  } else {
    tmb = 10 * dados.peso_kg + 6.25 * dados.altura_cm - 5 * dados.idade - 161;
  }

  const { fator, nivel } = detectarFatorAtividade(dados.atividade_tipo, dados.atividade_frequencia);
  const tdee = Math.round(tmb * fator);

  return {
    tmb_kcal: Math.round(tmb),
    tdee_kcal: tdee,
    fator_atividade: fator,
    nivel_atividade: nivel,
  };
}

export function calcularHidratacao(peso_kg: number): ResultadoHidratacao {
  const meta_ml = Math.round(peso_kg * 35);

  const porcao_ml = Math.round(meta_ml / 8);
  const distribuicao = [
    `☀️ Ao acordar: ${porcao_ml}ml`,
    `🍳 Cafe da manha: ${porcao_ml}ml`,
    `🌤️ Meio da manha: ${porcao_ml}ml`,
    `🍽️ Almoco: ${porcao_ml}ml`,
    `☕ Tarde: ${porcao_ml}ml`,
    `🌙 Jantar: ${porcao_ml}ml`,
    `🌃 Noite: ${porcao_ml}ml`,
    `🛌 Antes de dormir: ${meta_ml - porcao_ml * 7}ml`,
  ];

  return { meta_ml, distribuicao };
}

export function calcularCreatina(
  peso_kg: number,
  suplementos?: string[],
): ResultadoCreatina {
  if (suplementos && suplementos.length > 0) {
    const textoSuplementos = suplementos.join(' ').toLowerCase();

    const matchDose = textoSuplementos.match(/creatina[^\d]*(\d+(?:[.,]\d+)?)\s*g/);
    if (matchDose) {
      const dose = parseFloat(matchDose[1].replace(',', '.'));
      return {
        dose_g: dose,
        fonte: 'nutricionista',
        mensagem: `${dose}g/dia (conforme prescrito pelo seu nutricionista)`,
      };
    }

    if (textoSuplementos.includes('creatina')) {
      const dose = Math.round(peso_kg * 0.03 * 10) / 10;
      return {
        dose_g: dose,
        fonte: 'calculada',
        mensagem: `${dose}g/dia (0,03g/kg — dose padrao de manutencao)`,
      };
    }
  }

  const dose = Math.round(peso_kg * 0.03 * 10) / 10;
  return {
    dose_g: dose,
    fonte: 'calculada',
    mensagem: `${dose}g/dia (sugestao baseada em 0,03g/kg — confirme com seu nutricionista)`,
  };
}

// Splits por objetivo:
//   emagrecer    -20% TDEE  2.0 g/kg prot  25% kcal gord
//   ganhar_massa +10% TDEE  1.8 g/kg prot  25% kcal gord
//   manter        TDEE      1.6 g/kg prot  30% kcal gord
//   saude_geral   TDEE      1.4 g/kg prot  30% kcal gord
// Carbo = resto das calorias.
export function calcularMacros(
  tdee: number,
  objetivo: ObjetivoNutricional | undefined,
  peso_kg: number,
): MacrosDiarios {
  const obj = objetivo ?? 'manter';

  let kcal: number;
  let proteinaPorKg: number;
  let gorduraPctKcal: number;

  switch (obj) {
    case 'emagrecer':
      kcal = Math.round(tdee * 0.80);
      proteinaPorKg = 2.0;
      gorduraPctKcal = 0.25;
      break;
    case 'ganhar_massa':
      kcal = Math.round(tdee * 1.10);
      proteinaPorKg = 1.8;
      gorduraPctKcal = 0.25;
      break;
    case 'manter':
      kcal = tdee;
      proteinaPorKg = 1.6;
      gorduraPctKcal = 0.30;
      break;
    case 'saude_geral':
      kcal = tdee;
      proteinaPorKg = 1.4;
      gorduraPctKcal = 0.30;
      break;
  }

  const proteina_g = Math.round(peso_kg * proteinaPorKg);
  const gordura_g = Math.round((kcal * gorduraPctKcal) / 9);
  const kcalRestante = kcal - proteina_g * 4 - gordura_g * 9;
  const carbo_g = Math.max(0, Math.round(kcalRestante / 4));

  const kcalProt = proteina_g * 4;
  const kcalCarb = carbo_g * 4;
  const kcalGord = gordura_g * 9;
  const kcalTotal = kcalProt + kcalCarb + kcalGord || 1;

  return {
    kcal,
    proteina_g,
    carbo_g,
    gordura_g,
    proteina_pct: Math.round((kcalProt / kcalTotal) * 100),
    carbo_pct: Math.round((kcalCarb / kcalTotal) * 100),
    gordura_pct: Math.round((kcalGord / kcalTotal) * 100),
  };
}

// Ponto unico de verdade — meal.ts, vision.ts e agent.ts (saldo da foto)
// devem chamar isto, nao recalcular splits localmente.
export function obterMetas(dados: Record<string, unknown>): MacrosDiarios {
  const kcal = dados['metas_kcal'] as number | undefined;
  const prot = dados['metas_proteina_g'] as number | undefined;
  const carb = dados['metas_carbo_g'] as number | undefined;
  const gord = dados['metas_gordura_g'] as number | undefined;
  const aguaRaw = dados['hidratacao_ml'] as number | undefined;
  const agua_ml = typeof aguaRaw === 'number' && aguaRaw > 0 ? aguaRaw : undefined;

  if (kcal !== undefined && prot !== undefined && carb !== undefined && gord !== undefined) {
    const kcalTotal = prot * 4 + carb * 4 + gord * 9 || 1;
    return {
      kcal,
      proteina_g: prot,
      carbo_g: carb,
      gordura_g: gord,
      proteina_pct: Math.round(((prot * 4) / kcalTotal) * 100),
      carbo_pct: Math.round(((carb * 4) / kcalTotal) * 100),
      gordura_pct: Math.round(((gord * 9) / kcalTotal) * 100),
      agua_ml,
    };
  }

  const tdee = (dados['tdee_kcal'] as number) || 2000;
  return {
    kcal: tdee,
    proteina_g: Math.round((tdee * 0.30) / 4),
    carbo_g: Math.round((tdee * 0.40) / 4),
    gordura_g: Math.round((tdee * 0.30) / 9),
    proteina_pct: 30,
    carbo_pct: 40,
    gordura_pct: 30,
    agua_ml,
  };
}

export interface PerfilExplicacao {
  nome: string;
  objetivo?: ObjetivoNutricional;
  restricoes: string[];
}

// Caller DEVE envolver em try/catch — falha aqui nao pode derrubar o fim de
// entrevista (o paciente ja recebeu os numeros na mensagem anterior).
export async function gerarExplicacaoPersonalizada(
  perfil: PerfilExplicacao,
  tmb: ResultadoTMB,
  macros: MacrosDiarios,
  hidratacaoMl: number,
): Promise<string> {
  const OBJETIVO_LABEL: Record<ObjetivoNutricional, string> = {
    emagrecer: 'emagrecer',
    ganhar_massa: 'ganhar massa muscular',
    manter: 'manter o peso',
    saude_geral: 'saude geral',
  };
  const objetivoTxt = perfil.objetivo ? OBJETIVO_LABEL[perfil.objetivo] : 'manter o peso';
  const restricoesTxt = perfil.restricoes.length > 0 ? perfil.restricoes.join(', ') : 'nenhuma';

  const prompt = `Voce e o NutriChat, assistente nutricional via WhatsApp.

Acabei de calcular os numeros do(a) ${perfil.nome}:
- Objetivo: ${objetivoTxt}
- Restricoes / condicoes: ${restricoesTxt}
- TMB: ${tmb.tmb_kcal} kcal | TDEE: ${tmb.tdee_kcal} kcal (${tmb.nivel_atividade})
- Meta diaria: ${macros.kcal} kcal | ${macros.proteina_g}g proteina (${macros.proteina_pct}%) | ${macros.carbo_g}g carbo (${macros.carbo_pct}%) | ${macros.gordura_g}g gordura (${macros.gordura_pct}%)
- Hidratacao: ${hidratacaoMl}ml

Escreva uma explicacao personalizada em 2-3 paragrafos CURTOS (WhatsApp, nao email) que:
1. Explique o que e TDEE e por que essa meta calorica faz sentido pro objetivo dele(a)
2. Justifique o split de macros (proteina alta pra preservar musculo no emagrecimento, etc.) de forma simples
3. De 1 dica pratica adequada ao perfil

Tom: amigavel, direto, motivador. Sem jargao tecnico pesado. Emojis com moderacao.
Nao repita os numeros exatos — eles ja foram mostrados na mensagem anterior.

REGRA DE MARCA (P1-5, nao-negociavel):
- NUNCA recomende, mencione ou compare com apps, sites ou ferramentas externas (MyFitnessPal, FatSecret, Cronometer, LoseIt, YAZIO, Lifesum, Calorie Counter, planilhas Excel, contador de calorias, etc.).
- A "dica pratica" DEVE usar o proprio NutriChat. Exemplos validos: "me manda foto do prato que eu calculo pra voce", "se quiser, manda audio descrevendo o que comeu", "me pergunta a qualquer hora se um alimento cabe na meta".
- NAO faca promessa medica nem garantia de resultado (ex.: "voce vai perder X kg em Y semanas").

FORMATACAO (WhatsApp, nao Markdown):
- NUNCA use headers (# ou ##) — WhatsApp renderiza como texto literal feio.
- Para negrito use UM asterisco (*texto*), NUNCA dois (**texto**).
- Para italico use UM underscore (_texto_).
- NAO abra com titulo, headline ou "Resposta para Fulano" — comece direto pelo primeiro paragrafo.
- NAO repita o nome do paciente como saudacao no inicio (ele acabou de receber a msg anterior).`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].type === 'text' ? response.content[0].text : '';
  return sanitizarMencaoConcorrentes(texto);
}

// Descarta a sentenca inteira em vez de re-escrever (evita inventar conteudo).
const CONCORRENTES_RE = /\b(my\s*fitness\s*pal|myfitnesspal|fat\s*secret|fatsecret|cronometer|lose\s*it|loseit|yazio|lifesum|calorie\s*counter|contador\s+de\s+calorias)\b/i;

const DICA_ON_BRAND = 'Se quiser, me manda foto do prato (ou audio descrevendo) que eu calculo as macros pra voce em segundos.';

export function sanitizarMencaoConcorrentes(texto: string): string {
  if (!CONCORRENTES_RE.test(texto)) return texto;

  const sentencas = texto.split(/(?<=[.!?\n])\s+/);
  let substituiuAlguma = false;
  const limpas = sentencas
    .map((s) => {
      if (CONCORRENTES_RE.test(s)) {
        substituiuAlguma = true;
        return '';
      }
      return s;
    })
    .filter((s) => s.length > 0);

  let resultado = limpas.join(' ').replace(/\s+/g, ' ').trim();

  if (substituiuAlguma) {
    if (!/foto.*prato/i.test(resultado) && !/audio.*descrev/i.test(resultado)) {
      resultado = resultado ? `${resultado} ${DICA_ON_BRAND}` : DICA_ON_BRAND;
    }
  }

  return resultado;
}

export function formatarMensagemCalculos(
  tmb: ResultadoTMB,
  macros: MacrosDiarios,
  hidratacao: ResultadoHidratacao,
  creatina: ResultadoCreatina,
): string {
  return (
    `🎯 *Seus numeros personalizados:*\n\n` +
    `🔥 *Metabolismo (TMB):* ${tmb.tmb_kcal} kcal/dia\n` +
    `⚡ *Gasto total (TDEE):* ${tmb.tdee_kcal} kcal/dia\n` +
    `🏃 Nivel de atividade: ${tmb.nivel_atividade}\n\n` +
    `📊 *Meta diaria de macros:*\n` +
    `• 🍗 Proteina: ${macros.proteina_g}g (${macros.proteina_pct}%)\n` +
    `• 🍚 Carboidrato: ${macros.carbo_g}g (${macros.carbo_pct}%)\n` +
    `• 🥑 Gordura: ${macros.gordura_g}g (${macros.gordura_pct}%)\n` +
    `• 🎯 Total: *${macros.kcal} kcal/dia*\n\n` +
    `💧 *Hidratacao diaria:* ${hidratacao.meta_ml}ml\n` +
    `_Distribuicao sugerida:_\n${hidratacao.distribuicao.slice(0, 4).join('\n')}\n_(e mais 4 porcoes ao longo do dia)_\n\n` +
    `💊 *Creatina:* ${creatina.mensagem}`
  );
}
