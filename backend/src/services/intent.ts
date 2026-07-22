import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { comBackoff } from '../utils/retry';

// Fast-path regex pros casos obvios; Haiku decide o resto; safe default 'consulta'.

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

export type Intent = 'registrar' | 'corrigir' | 'agua' | 'consulta' | 'substituicao' | 'saldo';

export interface IntentResult {
  intent: Intent;
  fonte: 'fast-path' | 'haiku' | 'fallback';
}

const PERGUNTA_RE = /\?/;

// "como" tambem e verbo de registro ("Eu como 100g de frango").
// Protecao contra "como" interrogativo vem da checagem pergunta + palavra-consulta.
const VERBO_REGISTRO_RE = /\b(como|comi|almocei|jantei|merendei|lanchei|tomei\s+caf[eé])\b/i;

const QUANTIDADE_RE = /\d+\s*(g|ml|kg|gramas?|colher|colheres|fatias?|unidades?)\b/i;

// Aceita: inteiro, decimal (1.5 / 1,5), "X e meio/meia", "meio/meia" sozinho,
// "um/uma/dois/duas/tres/três" por extenso. Unidades: ml, litros, copos, garrafas, copin(inho).
// "1 e meio de aguas" (sem unidade explicita) NAO bate aqui — cai no Haiku e o handler pede clarificacao.
const AGUA_VOLUME_RE =
  /(?:\d+(?:[.,]\d+)?(?:\s+e\s+me[ia]o?)?|meio|meia|um[ao]?|dois|duas|tr[êe]s)\s*(ml|litros?|copos?|garrafas?|copin\w+)\b/i;
// \b em JS nao e Unicode-safe (falha antes de "água"); usar (?:^|\W)/(?=\W|$).
const AGUA_PALAVRA_RE = /(?:^|\W)(agua|água|d['']?[áa]gua|hidrat\w*)(?=\W|$)/i;

// Liquidos com kcal — NUNCA classificar como agua, mesmo com "bebi" e volume.
const LIQUIDO_CALORICO_RE =
  /\b(suco|refrigerante|guaran[aá]|leite|capuc[ch]ino|cerveja|vinho|whisky|cachac[aá]|achocolatado|smoothie|vitamina|iogurte|chocolate\s+quente|cha\s+gelado|cha\s+doce|isotonico|energetico|ka?besh|red\s+bull|monster)\b/i;
// Separado pra excluir "coca zero"/"coca diet" (sem kcal) do fast-path.
const COCA_CALORICA_RE = /\bcoca(?!.*zero)(?!.*diet)/i;

// "esqueci" NAO entra aqui: "esqueci de adicionar/falar X" e ADICAO (soma), nao substituicao.
// O intent 'corrigir' chama corrigirUltimaRefeicao (UPDATE + delta), que SUBSTITUI os macros.
// Com "esqueci" incluido, "esqueci de adicionar ovo" fazia arroz+feijao virar so ovo (carbo caia de 117 pra 32).
const CORRECAO_RE =
  /\b(na\s+verdade|a\s+verdade|foram|corrige|corrigir|corre[çc][aã]o|na\s+real|era\s+pra\s+ser)\b/i;

const SUBSTITUICAO_RE =
  /\b(substitu|n[aã]o\s+tenho|alternativa|trocar\s+(o|a|um|uma)|posso\s+trocar|pode\s+ser)\b/i;

const CONSULTA_PALAVRA_RE =
  /\b(qual|quais|como|onde|porqu[eê]|por\s+que|o\s+que\s+(e|é|posso|devo)|minha\s+dieta|meu\s+plano|recomend|sugest|dica\s+de)\b/i;

// Precedencia ALTA — "quanto comi hoje?" combina "?" + verbo de registro
// e sem essa regra seria deferida ao Haiku (que errava pra 'consulta').
const SALDO_RE =
  /\b(quant[oa]s?\s+(de\s+|gramas?\s+de\s+|g\s+de\s+)?(kcal|cal|calorias?|prote[ií]nas?|carb(o|oidrato)s?|gorduras?|[aá]gua|ml\b)|quant[oa]s?\s+(eu\s+)?(j[aá]\s+)?(consumi|comi|tomei|bebi)|saldo\s+do\s+dia|qual\s+(o\s+)?meu\s+(consumo|saldo|dia|progresso|resumo)|consumo\s+(do\s+dia|de\s+hoje|de\s+hj)|t[oô]u?\s+(dentro|fora|perto)\s+(da|de)\s+meta|j[aá]\s+(bati|passei|ultrapasse[ai])\s+(a|da)?\s*meta|bati\s+a?\s*meta|quanto\s+(falt(a|am|ou)|sobr(a|ou)|rest(a|ou|am))\b|meu\s+(dia|progresso|resumo)\b|resumo\s+d[oe]\s+(dia|hoje|hj)\b|progresso\s+(d[oe]\s+)?(hoje|hj|dia)\b|como\s+t[oôõ]u?\s+(hoje|hj)\b|cad[eê]\s+meu\s+(dia|resumo|progresso)\b)/i;

// Retorna Intent quando confiante; null quando deve consultar o Haiku.
export function classificarIntencaoRapida(texto: string): Intent | null {
  const t = texto.trim().toLowerCase();
  if (t.length === 0) return null;

  if (SALDO_RE.test(t)) {
    return 'saldo';
  }

  if (PERGUNTA_RE.test(t) && CONSULTA_PALAVRA_RE.test(t) && !VERBO_REGISTRO_RE.test(t)) {
    return 'consulta';
  }

  // "?" + verbo de registro e ambiguo ("comi bem, qual minha dieta?") — Haiku decide.
  if (PERGUNTA_RE.test(t) && VERBO_REGISTRO_RE.test(t)) {
    return null;
  }

  // Correcao antes de registrar. "esqueci" foi removido de CORRECAO_RE de proposito
  // (ver comentario em CORRECAO_RE); "esqueci de X" cai em registrar/consulta.
  if (CORRECAO_RE.test(t)) {
    return 'corrigir';
  }

  // Excluir verbo de comida — "comi 200g de frango com 500ml de agua" nao e agua.
  if (
    AGUA_VOLUME_RE.test(t) &&
    AGUA_PALAVRA_RE.test(t) &&
    !LIQUIDO_CALORICO_RE.test(t) &&
    !COCA_CALORICA_RE.test(t) &&
    !VERBO_REGISTRO_RE.test(t)
  ) {
    return 'agua';
  }

  if (AGUA_VOLUME_RE.test(t) && (LIQUIDO_CALORICO_RE.test(t) || COCA_CALORICA_RE.test(t))) {
    return 'registrar';
  }

  // Substituicao com quantidade vira registro novo, nao troca.
  if (SUBSTITUICAO_RE.test(t) && !QUANTIDADE_RE.test(t)) {
    return 'substituicao';
  }

  if (VERBO_REGISTRO_RE.test(t) && QUANTIDADE_RE.test(t)) {
    return 'registrar';
  }

  return null;
}

const SYSTEM_PROMPT_INTENT = `Você classifica a intenção da mensagem de um paciente em um app de nutrição via WhatsApp.

Responda APENAS com JSON no formato:
{"intent": "registrar" | "corrigir" | "agua" | "consulta" | "substituicao" | "saldo"}

Definições:
- "registrar": paciente informa uma refeição/comida/bebida calórica que comeu ou bebeu, OU quer ADICIONAR algo esquecido à última refeição. Ex: "comi 200g de frango", "tomei iogurte", "bebi 300ml de suco", "almocei arroz com feijão", "esqueci de adicionar 1 ovo frito", "esqueci de falar do feijão", "esqueci de incluir 70g de frango".
- "corrigir": paciente quer SUBSTITUIR o valor de macros/quantidade da última refeição (não adicionar item novo). Ex: "na verdade eram 150g", "corrige aí, foi arroz integral", "era pra ser 100g", "não foi 200g, foi 100g".
- "agua": registro EXCLUSIVO de hidratação (água pura). Ex: "bebi 500ml de água", "tomei 2 copos d'água", "1 e meio de água", "bebi meia garrafa d'água", "1,5 litro de água". NUNCA classifique suco, refrigerante, leite, café com leite ou cerveja como "agua" — esses são "registrar". Se falar em "água" mesmo SEM unidade clara ("bebi 1 e meio de águas"), classifique como "agua" — o handler pede clarificação.
- "substituicao": paciente pergunta se pode TROCAR um alimento da dieta prescrita. Ex: "posso trocar arroz por batata?", "não tenho frango, o que uso?", "tem alternativa pra ovo?".
- "saldo": paciente pergunta QUANTO já consumiu hoje vs a meta (kcal/proteína/carbo/gordura/água), OU pede resumo/progresso do dia. Ex: "quantas calorias consumi hoje?", "quanto comi de proteína?", "tô dentro da meta?", "quanto falta pra fechar o dia?", "qual meu saldo?", "meu dia", "cadê meu resumo", "progresso de hoje", "como tô hoje?".
- "consulta": qualquer dúvida sobre a dieta, plano, alimentos permitidos, dicas, horários, suplementação. Ex: "qual minha dieta?", "como tomar a creatina?", "que horas posso comer fruta?", "comi bem hoje, qual minha dieta?".

Regras de prioridade:
1. Pergunta sobre kcal/macros/água JÁ CONSUMIDOS hoje → "saldo", nunca "consulta". Marcadores: "quanto/quantas/quantos" + (calorias/proteína/carbo/gordura/água/consumi/comi); "saldo do dia"; "tô dentro/fora da meta"; "quanto falta/sobrou".
2. Frase com "?" geralmente é "consulta", a não ser que seja confirmação curta tipo "comi 200g de arroz, ok?".
3. "comi bem hoje, qual minha dieta?" → "consulta" (a pergunta é sobre o plano).
4. "esqueci de adicionar/falar/incluir/somar/colocar X" → SEMPRE "registrar" (soma X à conta do dia). NUNCA "corrigir" — corrigir substitui, o paciente quer somar.
5. "na verdade foram X", "corrige aí", "era pra ser X" → "corrigir" (substitui macros da última refeição).
6. Volume (ml/copo/litro/garrafa) + suco/leite/refrigerante/cerveja → "registrar", JAMAIS "agua".

Devolva APENAS o JSON. Nada de explicações.`;

export async function classificarIntencaoComHaiku(texto: string): Promise<Intent> {
  const response = await comBackoff(() =>
    claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32,
      system: SYSTEM_PROMPT_INTENT,
      messages: [{ role: 'user', content: texto }],
    }),
  );

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

// Volume + agua junto de outra intencao ("comi pao com 500ml de agua").
// Usa (?:^|\W)/(?=\W|$) pra ser Unicode-safe (\b falha antes de "água").
const AGUA_COMBINADA_RE = /(\d+)\s*(ml|litros?|copos?)[^,;.]{0,30}(?:^|\W)(agua|água|d['']?[áa]gua)(?=\W|$)/i;
export function mencionaAguaCombinada(texto: string): boolean {
  return AGUA_COMBINADA_RE.test(texto);
}

// Chamada antes do processarTextoRefeicao pra Vision nao listar agua como item.
const AGUA_COMBINADA_STRIP_RE =
  /(?:\s*(?:com|mais|e|,|\+)\s*)+\d+\s*(?:ml|litros?|copos?)\s*(?:de\s+)?(?:agua|água|d['']?[áa]gua)(?=\W|$)[,\s]*/gi;
export function removerMencaoAgua(texto: string): string {
  return texto.replace(AGUA_COMBINADA_STRIP_RE, ' ').replace(/\s+/g, ' ').trim();
}
