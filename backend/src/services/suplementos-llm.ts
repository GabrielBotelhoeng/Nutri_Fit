// Dose dinamica de suplementos via Claude Sonnet. Substitui o formatter
// hardcoded (`formatarMensagemSuplementos`) que so cobria 3 categorias
// (whey / cafeina / omega-3). Cobre agora *qualquer* suplemento alimentar
// legitimo (BCAA, glutamina, colageno, HMB, adaptogenos, vitaminas...) e
// manipulados descritos por composicao.
//
// Guard-rails:
//   1. `analisarSuplementos()` classifica ANTES — controlados nao entram
//      no prompt. Aviso deles continua hardcoded (formatarAvisoControlados).
//   2. Prompt instrui o LLM a nunca dar dose de peptideo/hormonio/SARM/
//      esteroide/medicamento. Se cair aqui um controlado que escapou do
//      dicionario, LLM deve categorizar como "controlado" -> sem dose.
//   3. Whitelist de categorias no output: so categorias marcadas como
//      "suplemento alimentar classico" recebem dose. Resto vira "valide
//      com nutri" mesmo se o LLM sugerir posologia.
//   4. Post-filter de termos suspeitos ("ciclo", "PCT", "ml/semana",
//      "protocolo hormonal") — se aparecer, descarta o item inteiro.
//   5. Cross-check contra CONTROLADOS: se o nome do item retornado pelo
//      LLM bater com algo da lista de controlados, forca `precisa_nutri`.
//
// Falha soft: se o Claude der erro (timeout/429/parse invalido), a funcao
// retorna `falhou: true` e o call site cai no formatter hardcoded antigo.

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { comBackoff } from '../utils/retry';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

// Categorias que o LLM pode retornar. Whitelist = pode ter dose. Blacklist
// = mesmo se o LLM sugerir posologia, a gente descarta e marca precisa_nutri.
const CATEGORIAS_COM_DOSE = new Set([
  'proteina',
  'aminoacido',
  'vitamina',
  'mineral',
  'omega',
  'estimulante_leve',
  'fitoterapico',
  'adaptogeno',
  'fibra',
  'probiotico',
  'outro_suplemento_alimentar',
]);

const CATEGORIAS_SEM_DOSE = new Set([
  'peptideo',
  'hormonio',
  'sarm',
  'esteroide',
  'medicamento',
  'controlado',
  'desconhecido',
]);

// Termos que denunciam que o LLM ta descrevendo protocolo de substancia
// controlada disfarcada. Se aparecer em `dose`, `timing` ou `cautela`,
// descarta o item.
const TERMOS_SUSPEITOS = [
  /\bml\s*\/\s*semana\b/i,
  /\bciclo\s+de\b/i,
  /\bpct\b/i,
  /\bpost[-\s]?cycle\b/i,
  /\bterapia\s+pos[-\s]?ciclo\b/i,
  /\bprotocolo\s+hormonal\b/i,
  /\banabolizante\b/i,
  /\bveterinario\b/i,
  /\binjeta(vel|r|do)\b/i,
];

export interface BlocoSuplemento {
  nome: string;
  categoria: string;
  dose: string | null;
  timing: string | null;
  cautela: string | null;
  precisa_nutri: boolean;
}

export interface ResultadoDoseLLM {
  blocos: BlocoSuplemento[];
  falhou: boolean;
}

const SYSTEM_PROMPT = `Voce e um assistente nutricional que orienta sobre suplementos ALIMENTARES.

REGRA DE SEGURANCA (INEGOCIAVEL):
- Nunca sugira dose de peptideo (BPC-157, TB-500, MK-677, GHRP, ipamorelina), hormonio (GH, HGH, insulina, testosterona), SARM (ostarine, ligandrol, RAD-140), esteroide anabolizante (stanozolol, oxandrolona, trembolona), emagrecedor controlado (sibutramina, anfepramona), ou qualquer medicamento com receita.
- Se qualquer item da lista se encaixar acima, categoria = "hormonio"/"peptideo"/"sarm"/"esteroide"/"medicamento" conforme o caso, e dose = null.
- Se nao souber a composicao (ex: nome comercial de manipulado), categoria = "desconhecido", dose = null, cautela = "me manda os ingredientes que eu explico cada um".

ENTRADA: JSON com peso_kg, sexo, objetivo, e lista de suplementos que o paciente relatou.

SAIDA: apenas um JSON no formato:
{
  "itens": [
    {
      "nome": "string (o que o paciente escreveu, corrigido)",
      "categoria": "proteina|aminoacido|vitamina|mineral|omega|estimulante_leve|fitoterapico|adaptogeno|fibra|probiotico|outro_suplemento_alimentar|peptideo|hormonio|sarm|esteroide|medicamento|controlado|desconhecido",
      "dose": "string com dose sugerida (ex: '10-20g/dia' ou '${'0.3g/kg = ~24g'}') ou null",
      "timing": "string curta (ex: 'pos-treino') ou null",
      "cautela": "string curta com precaucao relevante ou null"
    }
  ]
}

Diretrizes de dose (quando aplicavel):
- Proteinas/aminoacidos: dose por kg de peso quando existir referencia (ISSN, SBP)
- Vitaminas/minerais: RDA/UL da ANVISA
- Fitoterapicos/adaptogenos: dose padrao da literatura (ex: ashwagandha 300-600mg)
- Estimulantes leves (cafeina, cha verde): teto 400mg cafeina/dia (ANVISA)
- Omega-3: 1-2g EPA+DHA/dia (AHA)
- Sempre alertar que e sugestao inicial e nutricionista pode ajustar

Varie o fraseamento entre pacientes (nao devolva sempre a mesma string).
Nao inclua nada fora do JSON. Nao inclua markdown fences.`;

interface RespostaLLM {
  itens?: Array<{
    nome?: unknown;
    categoria?: unknown;
    dose?: unknown;
    timing?: unknown;
    cautela?: unknown;
  }>;
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function contemTermoSuspeito(campos: Array<string | null>): boolean {
  for (const c of campos) {
    if (!c) continue;
    for (const re of TERMOS_SUSPEITOS) if (re.test(c)) return true;
  }
  return false;
}

// Cross-check: se o nome bater com algum item da lista de controlados
// (mesmo depois do filtro pre-LLM), forca precisa_nutri. Import dinamico
// pra nao criar dependencia circular em teste.
function nomeEhControlado(nome: string, listaControlados: Set<string>): boolean {
  const norm = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const chave of listaControlados) {
    const re = new RegExp(`(?:^|\\W)${chave.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\W|$)`);
    if (re.test(` ${norm} `)) return true;
  }
  return false;
}

export async function sugerirDoseSuplementosLLM(
  contexto: {
    peso_kg: number;
    sexo: string;
    objetivo: string;
  },
  suplementosSeguros: string[],
  suplementosDesconhecidos: string[],
  listaControlados: Set<string>,
): Promise<ResultadoDoseLLM> {
  const itensParaAnalise = [...suplementosSeguros, ...suplementosDesconhecidos];
  if (itensParaAnalise.length === 0) return { blocos: [], falhou: false };

  const payload = {
    peso_kg: contexto.peso_kg,
    sexo: contexto.sexo,
    objetivo: contexto.objetivo,
    suplementos: itensParaAnalise,
  };

  try {
    const response = await comBackoff(() =>
      claude.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        temperature: 0.5,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    );

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const limpo = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(limpo) as RespostaLLM;

    if (!Array.isArray(parsed.itens)) return { blocos: [], falhou: true };

    const blocos: BlocoSuplemento[] = parsed.itens
      .map((item): BlocoSuplemento | null => {
        if (!isString(item.nome)) return null;
        const nome = item.nome.trim();
        const categoria = isString(item.categoria) ? item.categoria.toLowerCase().trim() : 'desconhecido';
        let dose = isString(item.dose) ? item.dose.trim() : null;
        let timing = isString(item.timing) ? item.timing.trim() : null;
        let cautela = isString(item.cautela) ? item.cautela.trim() : null;

        const forcaSemDose =
          CATEGORIAS_SEM_DOSE.has(categoria) ||
          !CATEGORIAS_COM_DOSE.has(categoria) ||
          contemTermoSuspeito([dose, timing, cautela]) ||
          nomeEhControlado(nome, listaControlados);

        if (forcaSemDose) {
          dose = null;
          timing = null;
          if (!cautela) cautela = 'valide com seu(sua) nutricionista antes de usar';
        }

        return {
          nome,
          categoria,
          dose,
          timing,
          cautela,
          precisa_nutri: forcaSemDose,
        };
      })
      .filter((b): b is BlocoSuplemento => b !== null);

    return { blocos, falhou: false };
  } catch {
    return { blocos: [], falhou: true };
  }
}

export function formatarMensagemSuplementosLLM(blocos: BlocoSuplemento[]): string {
  if (blocos.length === 0) return '';

  const linhas: string[] = ['💊 *Sobre seus suplementos*\n'];

  for (const b of blocos) {
    linhas.push(`*${b.nome}*`);
    if (b.dose) linhas.push(`• Dose sugerida: ${b.dose}`);
    if (b.timing) linhas.push(`• Quando: ${b.timing}`);
    if (b.cautela) linhas.push(`• Cuidado: ${b.cautela}`);
    if (b.precisa_nutri && !b.dose) {
      linhas.push(`• _Não vou sugerir dose — precisa de orientação do(a) seu(sua) nutri/médico(a)._`);
    }
    linhas.push('');
  }

  linhas.push(
    '_Sugestões iniciais baseadas em referência (ISSN, SBP, AHA, ANVISA). Seu(sua) nutricionista pode ajustar conforme sua rotina e exames._',
  );

  return linhas.join('\n');
}
