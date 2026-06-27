import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

// P1-3: classificador de intencao da mensagem do paciente. Substitui o roteamento
// por regex empilhada do agent.ts (`ehRegistro`, `ehSubstituicao`, `ehCorrecao`,
// `ehAguaMsg`), que falhava em casos como "bebi 300ml de suco" (caia em agua) e
// "comi bem hoje, qual minha dieta?" (caia em registro). Estrategia: fast-path
// regex pra casos obvios; Haiku decide o resto; safe default 'consulta'.

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

export type Intent = 'registrar' | 'corrigir' | 'agua' | 'consulta' | 'substituicao' | 'saldo';

export interface IntentResult {
  intent: Intent;
  fonte: 'fast-path' | 'haiku' | 'fallback';
}

const PERGUNTA_RE = /\?/;

// "como" (presente do indicativo, 1a pessoa) tambem e verbo de registro:
// "Como 100g de frango" = "Eu como 100g de frango". A protecao contra "como"
// interrogativo vem da regra 1/2 do fast-path (pergunta + palavra-consulta).
const VERBO_REGISTRO_RE = /\b(como|comi|almocei|jantei|merendei|lanchei|tomei\s+caf[eé])\b/i;

const QUANTIDADE_RE = /\d+\s*(g|ml|kg|gramas?|colher|colheres|fatias?|unidades?)\b/i;

const AGUA_VOLUME_RE = /(\d+)\s*(ml|litros?|copos?)/i;
// IMPORTANTE: \b em JavaScript nao reconhece caracteres acentuados como \w, entao
// \b antes de "água" falha (porque "á" nao e \w). Usamos lookahead/lookbehind
// customizados (?:^|\W) e (?=\W|$) que sao Unicode-safe.
const AGUA_PALAVRA_RE = /(?:^|\W)(agua|água|d['']?[áa]gua|hidrat\w*)(?=\W|$)/i;

// Liquidos com kcal — NUNCA classificar como agua, mesmo com "bebi" e volume.
const LIQUIDO_CALORICO_RE =
  /\b(suco|refrigerante|guaran[aá]|leite|capuc[ch]ino|cerveja|vinho|whisky|cachac[aá]|achocolatado|smoothie|vitamina|iogurte|chocolate\s+quente|cha\s+gelado|cha\s+doce|isotonico|energetico|ka?besh|red\s+bull|monster)\b/i;
// Coca tem variantes: classic = caloria, zero = sem caloria. Detectamos
// separado pra nao bater no fast-path quando for "coca zero".
const COCA_CALORICA_RE = /\bcoca(?!.*zero)(?!.*diet)/i;

const CORRECAO_RE =
  /\b(na\s+verdade|a\s+verdade|foram|esqueci|corrige|corrigir|corre[çc][aã]o|na\s+real|era\s+pra\s+ser)\b/i;

const SUBSTITUICAO_RE =
  /\b(substitu|n[aã]o\s+tenho|alternativa|trocar\s+(o|a|um|uma)|posso\s+trocar|pode\s+ser)\b/i;

// Indicadores fortes de pergunta de consulta. Usados pra desempate quando ha "?".
const CONSULTA_PALAVRA_RE =
  /\b(qual|quais|como|onde|porqu[eê]|por\s+que|o\s+que\s+(e|é|posso|devo)|minha\s+dieta|meu\s+plano|recomend|sugest|dica\s+de)\b/i;

// Pergunta de saldo do dia (kcal/macros consumidos vs meta). Bug UAT 2026-06-24:
// "quantas calorias eu consumi hoje?" caia em 'consulta' → RAG → Claude alucinava
// kcal. Precedencia ALTA no fast-path — antes das regras de pergunta/registro,
// porque casos como "quanto comi hoje?" combinam "?" + verbo de registro "comi"
// (regra 2 deferia ao Haiku que classificava como consulta).
const SALDO_RE =
  /\b(quant[oa]s?\s+(de\s+|gramas?\s+de\s+|g\s+de\s+)?(kcal|cal|calorias?|prote[ií]nas?|carb(o|oidrato)s?|gorduras?|[aá]gua|ml\b)|quant[oa]s?\s+(eu\s+)?(j[aá]\s+)?(consumi|comi|tomei|bebi)|saldo\s+do\s+dia|qual\s+(o\s+)?meu\s+(consumo|saldo)|consumo\s+(do\s+dia|de\s+hoje)|t[oô]u?\s+(dentro|fora|perto)\s+(da|de)\s+meta|j[aá]\s+(bati|passei|ultrapasse[ai])\s+(a|da)?\s*meta|bati\s+a?\s*meta|quanto\s+(falt(a|am|ou)|sobr(a|ou)|rest(a|ou|am))\b)/i;

// Fast-path: retorna Intent quando confiante; null quando deve consultar o Haiku.
export function classificarIntencaoRapida(texto: string): Intent | null {
  const t = texto.trim().toLowerCase();
  if (t.length === 0) return null;

  // 0. Pergunta de saldo do dia (kcal/macros/agua consumidos) → saldo. Precisa
  // vir antes das regras de pergunta/registro porque "quanto comi hoje?" combina
  // "?" + verbo de registro "comi" e seria deferida pro Haiku (que errava).
  if (SALDO_RE.test(t)) {
    return 'saldo';
  }

  // 1. Pergunta clara (pergunta + palavra de consulta sem verbo de registro) → consulta
  if (PERGUNTA_RE.test(t) && CONSULTA_PALAVRA_RE.test(t) && !VERBO_REGISTRO_RE.test(t)) {
    return 'consulta';
  }

  // 2. Frase com "?" + verbo de registro: ambigua ("comi bem, qual minha dieta?") → Haiku decide
  if (PERGUNTA_RE.test(t) && VERBO_REGISTRO_RE.test(t)) {
    return null;
  }

  // 3. Correcao explicita: precisa vir antes de "registrar" (pra "esqueci de falar 100g" virar corrigir)
  if (CORRECAO_RE.test(t)) {
    return 'corrigir';
  }

  // 4. Agua literal + volume, SEM liquido calorico e SEM verbo de registro de
  // comida na mesma mensagem → agua. Sem essa exclusao, "comi 200g de frango
  // com 500ml de agua" vira agua e o registro da comida some.
  if (
    AGUA_VOLUME_RE.test(t) &&
    AGUA_PALAVRA_RE.test(t) &&
    !LIQUIDO_CALORICO_RE.test(t) &&
    !COCA_CALORICA_RE.test(t) &&
    !VERBO_REGISTRO_RE.test(t)
  ) {
    return 'agua';
  }

  // 5. Volume + liquido calorico (suco, leite, refrigerante) → registrar, NUNCA agua
  if (AGUA_VOLUME_RE.test(t) && (LIQUIDO_CALORICO_RE.test(t) || COCA_CALORICA_RE.test(t))) {
    return 'registrar';
  }

  // 6. Substituicao explicita SEM quantidade (substituicao com quantidade vira registro novo)
  if (SUBSTITUICAO_RE.test(t) && !QUANTIDADE_RE.test(t)) {
    return 'substituicao';
  }

  // 7. Verbo de registro + quantidade explicita → registrar
  if (VERBO_REGISTRO_RE.test(t) && QUANTIDADE_RE.test(t)) {
    return 'registrar';
  }

  // 8. Tudo mais → Haiku decide ("comi banana" sem qtd; "preciso de uma dica"; etc.)
  return null;
}

const SYSTEM_PROMPT_INTENT = `Você classifica a intenção da mensagem de um paciente em um app de nutrição via WhatsApp.

Responda APENAS com JSON no formato:
{"intent": "registrar" | "corrigir" | "agua" | "consulta" | "substituicao" | "saldo"}

Definições:
- "registrar": paciente informa uma refeição/comida/bebida calórica que comeu ou bebeu. Ex: "comi 200g de frango", "tomei iogurte", "bebi 300ml de suco", "almocei arroz com feijão".
- "corrigir": paciente quer AJUSTAR a última refeição registrada. Ex: "na verdade eram 150g", "esqueci de falar do feijão", "corrige aí", "era pra ser 100g".
- "agua": registro EXCLUSIVO de hidratação (água pura). Ex: "bebi 500ml de água", "tomei 2 copos d'água". NUNCA classifique suco, refrigerante, leite, café com leite ou cerveja como "agua" — esses são "registrar".
- "substituicao": paciente pergunta se pode TROCAR um alimento da dieta prescrita. Ex: "posso trocar arroz por batata?", "não tenho frango, o que uso?", "tem alternativa pra ovo?".
- "saldo": paciente pergunta QUANTO já consumiu hoje vs a meta (kcal/proteína/carbo/gordura/água). Ex: "quantas calorias consumi hoje?", "quanto comi de proteína?", "tô dentro da meta?", "quanto falta pra fechar o dia?", "qual meu saldo?".
- "consulta": qualquer dúvida sobre a dieta, plano, alimentos permitidos, dicas, horários, suplementação. Ex: "qual minha dieta?", "como tomar a creatina?", "que horas posso comer fruta?", "comi bem hoje, qual minha dieta?".

Regras de prioridade:
1. Pergunta sobre kcal/macros/água JÁ CONSUMIDOS hoje → "saldo", nunca "consulta". Marcadores: "quanto/quantas/quantos" + (calorias/proteína/carbo/gordura/água/consumi/comi); "saldo do dia"; "tô dentro/fora da meta"; "quanto falta/sobrou".
2. Frase com "?" geralmente é "consulta", a não ser que seja confirmação curta tipo "comi 200g de arroz, ok?".
3. "comi bem hoje, qual minha dieta?" → "consulta" (a pergunta é sobre o plano).
4. "na verdade...", "foram X g...", "esqueci" → "corrigir".
5. Volume (ml/copo/litro) + suco/leite/refrigerante/cerveja → "registrar", JAMAIS "agua".

Devolva APENAS o JSON. Nada de explicações.`;

export async function classificarIntencaoComHaiku(texto: string): Promise<Intent> {
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 32,
    system: SYSTEM_PROMPT_INTENT,
    messages: [{ role: 'user', content: texto }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const limpo = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(limpo) as { intent?: string };
    const intent = parsed.intent;
    if (
      intent === 'registrar' ||
      intent === 'corrigir' ||
      intent === 'agua' ||
      intent === 'consulta' ||
      intent === 'substituicao' ||
      intent === 'saldo'
    ) {
      return intent;
    }
  } catch {
    // fall through
  }
  console.warn(`[intent] Haiku retornou intencao invalida: ${raw}`);
  return 'consulta';
}

export async function classificarIntencao(texto: string): Promise<IntentResult> {
  const rapida = classificarIntencaoRapida(texto);
  if (rapida) {
    return { intent: rapida, fonte: 'fast-path' };
  }
  try {
    const intent = await classificarIntencaoComHaiku(texto);
    return { intent, fonte: 'haiku' };
  } catch (err) {
    console.error('[intent] Haiku falhou:', err);
    return { intent: 'consulta', fonte: 'fallback' };
  }
}

// Detecta "Yml/copo/litro de agua" combinado numa mensagem cuja intencao
// primaria nao e agua (ex: "comi pao com 500ml de agua"). Usado pelo agent.ts
// pra incrementar o contador silencioso antes do card da refeicao.
// Mesmo cuidado com \b unicode-unsafe: usamos (?:^|\W) / (?=\W|$) em vez de \b.
const AGUA_COMBINADA_RE = /(\d+)\s*(ml|litros?|copos?)[^,;.]{0,30}(?:^|\W)(agua|água|d['']?[áa]gua)(?=\W|$)/i;
export function mencionaAguaCombinada(texto: string): boolean {
  return AGUA_COMBINADA_RE.test(texto);
}

// P1-3.1: remove o trecho "[com/+/e/,] Yml/copos de agua" do texto antes do
// processarTextoRefeicao, pra que a LLM nao liste agua como item da refeicao
// (a hidratacao ja foi incrementada silenciosamente via mencionaAguaCombinada).
const AGUA_COMBINADA_STRIP_RE =
  /(?:\s*(?:com|mais|e|,|\+)\s*)+\d+\s*(?:ml|litros?|copos?)\s*(?:de\s+)?(?:agua|água|d['']?[áa]gua)(?=\W|$)[,\s]*/gi;
export function removerMencaoAgua(texto: string): string {
  return texto.replace(AGUA_COMBINADA_STRIP_RE, ' ').replace(/\s+/g, ' ').trim();
}
