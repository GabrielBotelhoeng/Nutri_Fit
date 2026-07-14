import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { downloadMedia } from './audio';
import { sendText } from './evolution';
import { buscarPacientePorWhatsapp, getEstado, atualizarEstado } from './conversation';
import type { PacienteInfo } from './conversation';
import { processarCodigoBarras } from './barcode';
import { registrarRefeicao, obterSaldoDia, formatarBlocoProgressoDia, dispararAlertaOvershoot, calcularStreak, MacrosRefeicao } from './meal';
import { obterMetas, MacrosDiarios } from './calculos';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

function extrairJSON(texto: string): unknown {
  const limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(limpo);
}

function estaNoTimeout(timestamp: string, minutos = 5): boolean {
  return Date.now() - new Date(timestamp).getTime() <= minutos * 60 * 1000;
}

async function detectarTipoImagem(
  base64: string,
  mimetype: string,
): Promise<'prato' | 'barcode' | 'rotulo'> {
  const mimeClean = mimetype.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeClean, data: base64 } },
        { type: 'text', text: `Classifique a imagem em UMA categoria. Ordem de prioridade IMPORTA — aplique de cima pra baixo:\n\n1. "barcode" — TEM CÓDIGO DE BARRAS EAN/QR VISÍVEL (linhas verticais paralelas com números), independente de a embalagem estar fechada, aberta ou faltar tabela nutricional. Se o código de barras é o elemento MAIS legível da foto, é "barcode".\n2. "rotulo" — NÃO tem código de barras claro MAS tem TABELA NUTRICIONAL legível (linhas de "Valor energético", "Carboidratos", "Proteínas" com números). Rótulo de ingredientes SEM tabela não conta — cai em "barcode" se houver código, ou "prato" se for embalagem sem info nutricional.\n3. "prato" — comida servida (pratos, tigelas, marmitas, bebida em copo), OU qualquer outra coisa que não seja código de barras nem tabela nutricional.\n\nResponda com UMA palavra: barcode, rotulo ou prato. Sem explicação.` },
      ],
    }],
  });
  const tipo = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : 'prato';
  if (tipo === 'barcode' || tipo === 'rotulo') return tipo;
  return 'prato';
}

export type AmbiguidadeFoto = 'nenhuma' | 'multiplos_pratos_parecidos' | 'refeicoes_distintas';

// Uma refeicao dentro do split quando ambiguidade === 'refeicoes_distintas'.
// Estrutura simples (sem itens estruturados como em meal.ts) — foto nao tem
// gramas confiaveis por item, so agregado por refeicao.
export interface RefeicaoPratoDetectada {
  alimentos: string[];
  macros: MacrosRefeicao;
}

export interface AnalisePrato {
  alimentos: string[];
  confianca: 'alta' | 'media' | 'baixa';
  macros: MacrosRefeicao;
  aviso: string | null;
  // `ambiguidade` marca cenarios em que a foto tem mais de 1 "unidade" e a
  // interpretacao muda o total (mesa da familia = dividir; almoco+janta na
  // mesma foto = 2 registros). Default 'nenhuma' pra compat com prompts
  // antigos e casos claros (1 prato = 1 refeicao).
  ambiguidade: AmbiguidadeFoto;
  // Preenchido pelo Claude Vision so quando ambiguidade === 'refeicoes_distintas'.
  // Se o paciente responder "separadas", cada uma vira 1 registro.
  refeicoes?: RefeicaoPratoDetectada[];
}

export async function analisarPrato(base64s: string[], mimetype: string): Promise<AnalisePrato> {
  const mimeClean = mimetype.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  const imageBlocks = base64s.map((b64) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: mimeClean, data: b64 },
  }));

  const promptAviso = base64s.length === 2
    ? '\n\nO paciente enviou 2 fotos — podem ser 2 ângulos do MESMO prato OU cenas diferentes (mesa da família, várias porções). ANALISE cada foto e reflita isso no campo `ambiguidade`.'
    : '\n\n⚠️ Apenas 1 foto disponível — estime porção conservadoramente e indique limitação no campo aviso.';

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `Você é um assistente nutricional. Analise esta foto de refeição.${promptAviso}

TAREFA: Identifique os alimentos visíveis, estime os macronutrientes e classifique se a foto tem múltiplas "unidades" ambíguas.

⚠️ ANTES DE TUDO: CONTE os recipientes de comida individuais visíveis (pratos servidos, tigelas, bandejas de servir, travessas, potes, marmitas). Se houver 2+ recipientes com comida, a foto NÃO é 1 refeição individual — provavelmente é mesa de compartilhar OU mesa família. Só use ambiguidade="nenhuma" quando for CLARAMENTE 1 prato/marmita individual do paciente (podendo ter uma bebida ou sobremesa acompanhando). Duas mãos segurando pratos, mesa com pratos individuais parecidos, ou mesa com bandejas/travessas de servir = NUNCA é "nenhuma".

Ambiguidade:
- "nenhuma": 1 prato individual/marmita com vários alimentos (arroz+feijão+frango), ou 1 prato + 1 sobremesa/bebida acompanhando (é 1 refeição completa do paciente), ou apenas 1 recipiente/bebida.
- "multiplos_pratos_parecidos": 2+ pratos individuais parecidos (mesa da família — cada um com o próprio prato), OU **mesa de servir com bandejas/travessas de compartilhamento** (ex: 1 travessa de arroz + 1 bandeja de carne + 1 pote de feijão + 1 pote de farofa numa mesa — o paciente só vai pegar a porção dele daquilo tudo), OU 2+ bebidas iguais em série (2 latas, 2 copos idênticos). Em todos esses casos, a soma dos macros ≠ o que o paciente comeu.
- "refeicoes_distintas": 2+ pratos/marmitas do MESMO paciente contendo refeições CLARAMENTE DIFERENTES (ex: prato com arroz+carne + prato com panqueca+ovo = almoço + café; ou 1 marmita + 1 lanche).

EXEMPLOS:
1. Foto: 1 prato com arroz, feijão, frango grelhado e salada → ambiguidade="nenhuma" (é 1 refeição individual do paciente).
2. Foto: mesa com 3 pratos parecidos (cada um com arroz+feijão+carne) → ambiguidade="multiplos_pratos_parecidos" (mesa da família com pratos individuais).
3. Foto: 2 mãos segurando 2 pratos com comida similar → ambiguidade="multiplos_pratos_parecidos".
4. Foto: mesa com 1 bandeja de carne fatiada + 1 bandeja de arroz+batata frita + 1 pote de feijão + 1 pote de farofa (bandejas de servir/self-service familiar) → ambiguidade="multiplos_pratos_parecidos" (a soma das bandejas é a comida da mesa toda, não a porção do paciente).
5. Foto: 1 marmita com panqueca+ovo + 1 marmita ao lado com arroz+carne → ambiguidade="refeicoes_distintas" (café + almoço do mesmo paciente).
6. Foto: 1 hambúrguer + batata frita + refrigerante em um único conjunto → ambiguidade="nenhuma" (1 combo, 1 refeição).

RESPONDA EM JSON com exatamente este formato:
{"alimentos": ["alimento 1 com quantidade estimada", "alimento 2..."], "confianca": "alta", "kcal": 500, "proteina_g": 30, "carbo_g": 60, "gordura_g": 15, "aviso": null, "ambiguidade": "nenhuma", "refeicoes": null}

Regras:
- alimentos/kcal/macros: SEMPRE preenchidos com o AGREGADO da foto inteira (soma tudo). Não dependa do valor de ambiguidade.
- ambiguidade: use apenas os 3 valores acima.
- refeicoes: preencha SOMENTE quando ambiguidade="refeicoes_distintas". Formato: [{"alimentos": [...], "kcal": N, "proteina_g": N, "carbo_g": N, "gordura_g": N}, ...]. Caso contrário use null.
- confianca: "alta" (alimentos claramente visíveis), "media" (parcialmente visível), "baixa" (difícil identificar).
- Se a porção for incerta, estime conservadoramente e coloque aviso descritivo.
- Responda APENAS com JSON válido, sem markdown.`,
        },
      ],
    }],
  });

  const texto = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const raw = extrairJSON(texto) as Record<string, unknown>;
    return {
      alimentos: (raw['alimentos'] as string[]) || [],
      confianca: (raw['confianca'] as 'alta' | 'media' | 'baixa') || 'baixa',
      macros: {
        kcal:       Number(raw['kcal'])       || 0,
        proteina_g: Number(raw['proteina_g']) || 0,
        carbo_g:    Number(raw['carbo_g'])    || 0,
        gordura_g:  Number(raw['gordura_g'])  || 0,
      },
      aviso: (raw['aviso'] as string | null) || null,
      ambiguidade: normalizarAmbiguidade(raw['ambiguidade']),
      refeicoes: normalizarRefeicoesPrato(raw['refeicoes']),
    };
  } catch {
    console.error('[vision] Falha ao parsear análise de prato:', texto);
    return {
      alimentos: [], confianca: 'baixa',
      macros: { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 },
      aviso: 'Não consegui analisar o prato',
      ambiguidade: 'nenhuma',
    };
  }
}

// Normaliza o campo `ambiguidade` do JSON do Claude. Prompts antigos, respostas
// sem o campo, ou valores desconhecidos caem em 'nenhuma' — mantem
// compatibilidade e defaulta pro fluxo atual (sem regressao).
function normalizarAmbiguidade(raw: unknown): AmbiguidadeFoto {
  if (raw === 'multiplos_pratos_parecidos' || raw === 'refeicoes_distintas') return raw;
  return 'nenhuma';
}

// Normaliza o array `refeicoes` retornado quando ambiguidade='refeicoes_distintas'.
// Retorna undefined pra shapes invalidos ou vazios — o handler decide se cai no
// fluxo agregado.
function normalizarRefeicoesPrato(raw: unknown): RefeicaoPratoDetectada[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const arr = raw.map((r) => {
    const it = (r ?? {}) as Record<string, unknown>;
    return {
      alimentos: Array.isArray(it['alimentos']) ? (it['alimentos'] as string[]) : [],
      macros: {
        kcal:       Number(it['kcal'])       || 0,
        proteina_g: Number(it['proteina_g']) || 0,
        carbo_g:    Number(it['carbo_g'])    || 0,
        gordura_g:  Number(it['gordura_g'])  || 0,
      },
    };
  }).filter((r) => r.alimentos.length > 0 && r.macros.kcal > 0);
  return arr.length >= 2 ? arr : undefined;
}

interface DadosRotulo {
  produto: string;
  porcao_g: number;
  macros: MacrosRefeicao;
}

async function lerRotulo(base64: string, mimetype: string): Promise<DadosRotulo | null> {
  const mimeClean = mimetype.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeClean, data: base64 } },
        { type: 'text', text: `Você é um assistente nutricional. Leia esta tabela nutricional de rótulo.

RESPONDA EM JSON com exatamente este formato:
{"produto": "nome do produto se visível", "porcao_g": 100, "kcal_porcao": 200, "proteina_g": 10, "carbo_g": 30, "gordura_g": 5}

Se algum campo não estiver visível, use null. Responda APENAS com JSON válido.` },
      ],
    }],
  });
  const texto = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const raw = extrairJSON(texto) as Record<string, unknown>;
    return {
      produto: (raw['produto'] as string) || 'Produto desconhecido',
      porcao_g: Number(raw['porcao_g']) || 100,
      macros: {
        kcal:       Number(raw['kcal_porcao']) || 0,
        proteina_g: Number(raw['proteina_g'])  || 0,
        carbo_g:    Number(raw['carbo_g'])     || 0,
        gordura_g:  Number(raw['gordura_g'])   || 0,
      },
    };
  } catch {
    console.error('[vision] Falha ao parsear rótulo:', texto);
    return null;
  }
}

// Bug D-06 fix (2026-07-08): interpreta resposta do card D-06.
// Aceita variacoes comuns de sim/nao. Qualquer outra coisa e tratada em
// agent.ts como "cancela o card e trata como refeicao nova por texto".
//
// 2026-07-09: paciente digitou "Aim" no UAT real e caiu em 'outro' →
// cancelou card. Fast-path regex nao pega typos. Nova arquitetura em 2 fases,
// espelhando o padrao de intent.ts (classificarIntencaoRapida + Haiku):
//   1. Fast-path (gratis, instantaneo) — casos exatos e casos claros de 'outro'
//      (frase longa, com quantidade, com pontuacao). Cobre 99% do trafego.
//   2. Fallback Haiku — so palavras curtas ambiguas ("aim", "aham", "beleza",
//      "nap"). Custo por chamada ~$0.0003.
export function interpretarConfirmacaoRapida(texto: string): 'sim' | 'nao' | 'outro' | null {
  const t = texto.toLowerCase().trim();
  if (t.length === 0) return 'outro';
  if (t === 'sim' || t === 's' || t === 'yes' || t === 'ok' || t === '👍') return 'sim';
  if (t === 'não' || t === 'nao' || t === 'n' || t === 'no') return 'nao';
  // Contem quantidade explicita → correcao parcial ou refeicao nova, jamais confirmacao
  if (/\d/.test(t)) return 'outro';
  // Frase estruturada (virgula, ponto, ponto-de-exclamacao, interrogacao) → nao e confirmacao curta
  if (/[,.!?;]/.test(t)) return 'outro';
  // Frase longa (> 15 chars sem pontuacao) → provavel descricao de refeicao
  if (t.length > 15) return 'outro';
  // Curto e desconhecido → ambiguo, deixa Haiku decidir ("aim", "aham", "beleza", "nap")
  return null;
}

const SYSTEM_PROMPT_CONFIRMACAO = `Você recebe UMA resposta curta de um paciente que acabou de ver um card do WhatsApp perguntando se ele confirma uma refeição identificada por foto. As opções que o paciente conhece são:
• *sim* para registrar
• *não* para cancelar
• ou uma correção por texto (ex: "70g de abobrinha e 70g de ovo")

Classifique a resposta em uma dessas categorias:
- "sim" — o paciente está confirmando. Inclui variações escritas com typo, gírias ou expressões de aceitação: "aim", "sinm", "simm", "aham", "uhum", "beleza", "blz", "pode ser", "pode registrar", "bora", "manda ver", "confirmado", "isso", "isso mesmo", "certo", "tá certo", "tá bom", "tudo certo", "positivo".
- "nao" — o paciente está negando/cancelando. Inclui: "nap", "naum", "nn", "nada disso", "errado", "não é isso", "cancela", "negativo".
- "outro" — qualquer coisa que não seja confirmação nem negação (dúvida, saudação, mudança de assunto, silêncio, etc).

Responda APENAS com JSON no formato:
{"resposta": "sim" | "nao" | "outro"}

Nada de explicações.`;

export async function interpretarConfirmacaoComHaiku(texto: string): Promise<'sim' | 'nao' | 'outro'> {
  try {
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32,
      system: SYSTEM_PROMPT_CONFIRMACAO,
      messages: [{ role: 'user', content: texto }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const limpo = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(limpo) as { resposta?: string };
    const r = parsed.resposta;
    if (r === 'sim' || r === 'nao' || r === 'outro') return r;
    console.warn(`[vision] Haiku confirmacao retornou resposta invalida: ${raw}`);
    return 'outro';
  } catch (err) {
    console.error('[vision] Haiku confirmacao falhou:', err);
    return 'outro';
  }
}

export async function interpretarRespostaConfirmacao(texto: string): Promise<'sim' | 'nao' | 'outro'> {
  const rapida = interpretarConfirmacaoRapida(texto);
  if (rapida !== null) return rapida;
  return interpretarConfirmacaoComHaiku(texto);
}

// Bug D-06 fix (2026-07-08): monta o texto do card D-06. Extraido de
// handleConfirmacaoPrato pra reusar na re-emissao pos-correcao (Opcao C1).
export interface OpcoesCard {
  avisoExtra?: string;
  cabecalho?: string;
  // Quando true, expande o bloco de kcal em kcal+P/C/G (rico em detalhes).
  // Usado pra barcode/rotulo — a foto tem 1 produto com macros conhecidas
  // do OpenFoodFacts, então vale mostrar tudo pro paciente conferir.
  detalhesMacros?: boolean;
  // Exemplo customizado pra linha "ou me manda a refeição corrigida".
  // Default é neutro-pra-prato ("70g de abobrinha e 70g de ovo"); barcode
  // passa algo relevante ao produto ("50g" ou "meia embalagem").
  exemploCorrecao?: string;
}

export function montarTextoCard(analise: AnalisePrato, avisoExtra?: string, cabecalho?: string, opts?: Pick<OpcoesCard, 'detalhesMacros' | 'exemploCorrecao'>): string {
  const lista = analise.alimentos.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const avisoConfianca = analise.confianca === 'baixa' ? '\n⚠️ Baixa confiança na identificação.' : '';
  const avisoLimitacao = avisoExtra ? `\n${avisoExtra}` : '';
  const header = cabecalho ?? '📸 Identifiquei na foto:';
  const m = analise.macros;
  const blocoMacros = opts?.detalhesMacros
    ? `Est. *${Math.round(m.kcal)} kcal*\n• Proteína: ${Math.round(m.proteina_g)}g\n• Carbo: ${Math.round(m.carbo_g)}g\n• Gordura: ${Math.round(m.gordura_g)}g`
    : `Est. ${Math.round(m.kcal)} kcal`;
  const exemplo = opts?.exemploCorrecao ?? '70g de abobrinha e 70g de ovo';
  return `${header}\n${lista}\n\n${blocoMacros}${avisoConfianca}${avisoLimitacao}\n\nEstá correto?\n• *sim* para registrar\n• *não* para cancelar\n• ou me manda a refeição corrigida por texto (ex: "${exemplo}")`;
}

// Bug D-06 fix (2026-07-08): salva confirmacao_pendente + envia card.
// Reutilizado pela emissao inicial (foto nova) e pela re-emissao pos-merge
// de correcao parcial via Haiku (Opcao C1).
export async function enviarCardConfirmacao(
  phone: string,
  paciente: PacienteInfo,
  analise: AnalisePrato,
  opcoes?: OpcoesCard,
): Promise<void> {
  if (analise.macros.kcal === 0 || analise.alimentos.length === 0) {
    await sendText(phone, '❌ Não consegui identificar os alimentos. Tente uma foto com mais luz ou descreva por texto.');
    return;
  }
  await atualizarEstado(paciente.id, {
    dados: {
      confirmacao_pendente: {
        analise,
        timestamp: new Date().toISOString(),
      },
    },
  });
  await sendText(phone, montarTextoCard(analise, opcoes?.avisoExtra, opcoes?.cabecalho, {
    detalhesMacros: opcoes?.detalhesMacros,
    exemploCorrecao: opcoes?.exemploCorrecao,
  }));
}

// Envia lista de alimentos identificados ao paciente e aguarda confirmação "sim"/"não" (D-06).
// A interceptação da resposta é feita em agent.ts no bloco confirmacao_pendente.
async function handleConfirmacaoPrato(
  phone: string,
  paciente: PacienteInfo,
  analise: AnalisePrato,
  metas: MacrosDiarios,
  avisoExtra?: string,
): Promise<void> {
  void metas;
  await enviarCardConfirmacao(phone, paciente, analise, { avisoExtra });
}

// Bug D-06 fix (2026-07-08) — Opcao C1.
// Recebe a analise atual do card + texto livre do paciente ("bife 200g, feijao 100g").
// Chama Haiku pra aplicar correcao PARCIAL: mantem itens nao mencionados, substitui
// quantidades dos mencionados, recalcula macros totais. Retorna null quando:
//   - Haiku retorna JSON invalido
//   - Haiku sinaliza "invalido: true" (paciente nao queria corrigir de fato)
//   - Analise resultante ficou vazia
// Nesses casos, agent.ts cai no fallback (Opcao B — cancela card + trata como
// refeicao nova via classificador de intent).
export async function aplicarCorrecaoParcial(
  analiseOriginal: AnalisePrato,
  textoCorrecao: string,
): Promise<AnalisePrato | null> {
  try {
    const resumo = {
      alimentos: analiseOriginal.alimentos,
      kcal: analiseOriginal.macros.kcal,
      proteina_g: analiseOriginal.macros.proteina_g,
      carbo_g: analiseOriginal.macros.carbo_g,
      gordura_g: analiseOriginal.macros.gordura_g,
    };
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `Você é um assistente nutricional. Um paciente enviou foto de refeição e o sistema identificou os alimentos abaixo. Ele está agora corrigindo QUANTIDADES de itens específicos.

ANÁLISE ORIGINAL DO PRATO:
${JSON.stringify(resumo)}

CORREÇÃO DO PACIENTE:
"${textoCorrecao}"

TAREFA: retorne a análise atualizada mantendo os itens não mencionados.

REGRAS:
- MANTENHA os itens não citados na correção (ex: se paciente citou só bife e feijão, preserve arroz, salada, batata etc.).
- SUBSTITUA a quantidade dos itens mencionados (ex: "bife 200g" → item bife vira ~200g).
- Se o paciente REMOVER um item ("sem arroz", "tira a batata"), elimine-o da lista.
- RECALCULE os macros TOTAIS considerando as novas quantidades (USDA-like).
- Se o texto não for interpretável como correção (é uma pergunta, cumprimento, ou refeição totalmente nova/independente), responda: {"invalido": true}

RESPONDA EM JSON, um dos dois formatos:
{"alimentos": ["item corrigido 1 com nova qtd", "item mantido 2 com qtd original", ...], "confianca": "media", "kcal": N, "proteina_g": N, "carbo_g": N, "gordura_g": N, "aviso": null}
ou
{"invalido": true}

Sem markdown, sem texto fora do JSON.`,
        }],
      }],
    });
    const texto = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const raw = extrairJSON(texto) as Record<string, unknown>;
    if (raw['invalido'] === true) {
      console.log('[vision] aplicarCorrecaoParcial: Haiku marcou invalido');
      return null;
    }
    const alimentos = Array.isArray(raw['alimentos']) ? (raw['alimentos'] as string[]) : [];
    const kcal = Number(raw['kcal']) || 0;
    if (alimentos.length === 0 || kcal === 0) {
      console.log('[vision] aplicarCorrecaoParcial: resposta vazia — fallback');
      return null;
    }
    return {
      alimentos,
      confianca: (raw['confianca'] as 'alta' | 'media' | 'baixa') || 'media',
      macros: {
        kcal,
        proteina_g: Number(raw['proteina_g']) || 0,
        carbo_g: Number(raw['carbo_g']) || 0,
        gordura_g: Number(raw['gordura_g']) || 0,
      },
      aviso: (raw['aviso'] as string | null) || null,
      // Correcao parcial nao muda ambiguidade — se paciente ja passou pela fase
      // C, chegou aqui com ambiguidade='nenhuma' (foto simples ou ja resolvida).
      ambiguidade: 'nenhuma',
    };
  } catch (e) {
    console.error('[vision] aplicarCorrecaoParcial falhou:', e);
    return null;
  }
}

// Ponto de entrada principal chamado pelo webhook.ts para mensagens de imagem.
export async function processarImagem(
  phone: string,
  messageId: string,
  caption?: string,
): Promise<void> {
  void caption; // caption disponível para uso futuro

  const paciente = await buscarPacientePorWhatsapp(phone);
  if (!paciente) return;

  try {
    const { buffer, mimetype } = await downloadMedia(messageId);
    const base64 = buffer.toString('base64');
    const estado = await getEstado(paciente.id);
    const dadosEstado = estado.dados as Record<string, unknown>;
    const metas = obterMetas(dadosEstado);

    const aguardando = dadosEstado['aguardando_foto_2'] as {
      foto1_message_id: string;
      foto1_base64: string;
      timestamp: string;
    } | undefined;

    if (aguardando) {
      if (estaNoTimeout(aguardando.timestamp)) {
        // 2ª foto dentro do prazo — processar com ambas (D-04)
        await atualizarEstado(paciente.id, { dados: { aguardando_foto_2: null } });
        const analise = await analisarPrato([aguardando.foto1_base64, base64], mimetype);
        if (analise.ambiguidade !== 'nenhuma') {
          await handleAmbiguidade(phone, paciente, analise);
          return;
        }
        await handleConfirmacaoPrato(phone, paciente, analise, metas);
        return;
      } else {
        // Timeout expirado — D-04: processar 1ª foto com aviso, tratar nova como nova 1ª foto
        console.log(`[vision] Timeout foto2 expirou para ${phone} — processando foto1 com aviso`);
        await atualizarEstado(paciente.id, { dados: { aguardando_foto_2: null } });
        const analiseFoto1 = await analisarPrato([aguardando.foto1_base64], mimetype);
        if (analiseFoto1.ambiguidade !== 'nenhuma') {
          await handleAmbiguidade(phone, paciente, analiseFoto1);
        } else {
          await handleConfirmacaoPrato(
            phone,
            paciente,
            analiseFoto1,
            metas,
            '⚠️ Estimativa baseada em apenas 1 foto (tempo para 2ª foto expirou) — pode variar até 30%.',
          );
        }
        await atualizarEstado(paciente.id, {
          dados: {
            aguardando_foto_2: {
              foto1_message_id: messageId,
              foto1_base64: base64,
              timestamp: new Date().toISOString(),
            },
          },
        });
        await sendText(phone, '📸 Recebi outra foto! Para uma estimativa de porção melhor, mande também uma foto lateral do prato.');
        return;
      }
    }

    // 1ª foto — detectar tipo automaticamente (D-03)
    const tipo = await detectarTipoImagem(base64, mimetype);
    console.log(`[vision] Tipo detectado: ${tipo} para ${phone}`);

    // Bug fix (2026-07-13): barcode e rótulo NÃO registram direto — foto de
    // embalagem fechada (ex: código de barras de Todynho intacto) era registrada
    // como consumida com 100g default. Agora ambos passam pelo card D-06 pro
    // paciente confirmar antes.
    if (tipo === 'barcode') {
      const produto = await processarCodigoBarras(base64, mimetype);
      if (produto) {
        const analiseBarcode: AnalisePrato = {
          alimentos: [`${produto.nome} (~100g)`],
          confianca: 'media',
          macros: produto.macrosPor100g,
          aviso: null,
          ambiguidade: 'nenhuma',
        };
        await enviarCardConfirmacao(phone, paciente, analiseBarcode, {
          cabecalho: '📦 Identifiquei o produto pelo código de barras:',
          avisoExtra: 'ℹ️ Assumindo ~100g. Se foi só a foto da embalagem fechada e você não consumiu, mande *não*.',
          detalhesMacros: true,
          exemploCorrecao: '50g' + (produto.nome ? ` de ${produto.nome.toLowerCase()}` : ''),
        });
        return;
      }
      const rotulo = await lerRotulo(base64, mimetype);
      if (rotulo) {
        const analiseRotulo: AnalisePrato = {
          alimentos: [`${rotulo.produto} (${rotulo.porcao_g}g)`],
          confianca: 'media',
          macros: rotulo.macros,
          aviso: null,
          ambiguidade: 'nenhuma',
        };
        await enviarCardConfirmacao(phone, paciente, analiseRotulo, {
          cabecalho: '🏷️ Li o rótulo do produto:',
          avisoExtra: `ℹ️ Considerando 1 porção (${rotulo.porcao_g}g). Se comeu diferente, mande a correção.`,
          detalhesMacros: true,
          exemploCorrecao: `${rotulo.porcao_g}g`,
        });
        return;
      }
      await sendText(phone, '❌ Não consegui ler o código de barras ou rótulo. Tente uma foto mais nítida ou descreva a refeição por texto.');
      return;
    }

    if (tipo === 'rotulo') {
      const rotulo = await lerRotulo(base64, mimetype);
      // Fallback (2026-07-13): Haiku pode classificar foto de código de barras
      // como "rotulo" quando a embalagem está visível. Se lerRotulo devolve
      // macros zeradas ou produto desconhecido, tenta OpenFoodFacts pelo EAN
      // antes de desistir.
      const rotuloVazio = !rotulo || rotulo.macros.kcal === 0 || rotulo.produto === 'Produto desconhecido';
      if (rotuloVazio) {
        const produto = await processarCodigoBarras(base64, mimetype);
        if (produto) {
          const analiseBarcode: AnalisePrato = {
            alimentos: [`${produto.nome} (~100g)`],
            confianca: 'media',
            macros: produto.macrosPor100g,
            aviso: null,
            ambiguidade: 'nenhuma',
          };
          await enviarCardConfirmacao(phone, paciente, analiseBarcode, {
            cabecalho: '📦 Identifiquei o produto pelo código de barras:',
            avisoExtra: 'ℹ️ Assumindo ~100g. Se foi só a foto da embalagem fechada e você não consumiu, mande *não*.',
            detalhesMacros: true,
            exemploCorrecao: '50g' + (produto.nome ? ` de ${produto.nome.toLowerCase()}` : ''),
          });
          return;
        }
        await sendText(phone, '❌ Não consegui ler o rótulo nem identificar o código de barras. Tente uma foto mais nítida com a tabela nutricional ou o código EAN em foco, ou descreva a refeição por texto.');
        return;
      }
      const analiseRotulo: AnalisePrato = {
        alimentos: [`${rotulo.produto} (${rotulo.porcao_g}g)`],
        confianca: 'media',
        macros: rotulo.macros,
        aviso: null,
        ambiguidade: 'nenhuma',
      };
      await enviarCardConfirmacao(phone, paciente, analiseRotulo, {
        cabecalho: '🏷️ Li o rótulo do produto:',
        avisoExtra: `ℹ️ Considerando 1 porção (${rotulo.porcao_g}g). Se comeu diferente, mande a correção.`,
        detalhesMacros: true,
        exemploCorrecao: `${rotulo.porcao_g}g`,
      });
      return;
    }

    // tipo === 'prato' — solicitar 2ª foto (D-04)
    await atualizarEstado(paciente.id, {
      dados: {
        aguardando_foto_2: {
          foto1_message_id: messageId,
          foto1_base64: base64,
          timestamp: new Date().toISOString(),
        },
      },
    });
    await sendText(phone, '📸 Para uma estimativa de porção melhor, mande também uma foto lateral do prato.');

  } catch (err) {
    console.error('[vision] Erro ao processar imagem:', err);
    await sendText(phone, '❌ Erro ao analisar a imagem. Tente novamente ou descreva a refeição por texto.');
  }
}

// Salva a analise em foto_ambigua_pendente e pergunta ao paciente como interpretar.
// A resposta eh interceptada em agent.ts (antes de confirmacao_pendente) e enviada
// pra resolverAmbiguidadeFoto. Mesmo padrao D-06 usado por handleConfirmacaoPrato.
export async function handleAmbiguidade(
  phone: string,
  paciente: PacienteInfo,
  analise: AnalisePrato,
): Promise<void> {
  const tipo: 'pessoas' | 'refeicoes' = analise.ambiguidade === 'multiplos_pratos_parecidos'
    ? 'pessoas'
    : 'refeicoes';
  await atualizarEstado(paciente.id, {
    dados: {
      foto_ambigua_pendente: {
        tipo,
        analise,
        timestamp: new Date().toISOString(),
      },
    } as Parameters<typeof atualizarEstado>[1]['dados'],
  });
  const pergunta = tipo === 'pessoas'
    ? '📸 Vi mais de um prato parecido na foto — é só o seu ou tem mais alguém comendo? Manda o número de pessoas (ex: *1*, *2*, *3*).'
    : '📸 Vi refeições diferentes na foto — quer registrar como *uma só* ou *separadas*?';
  await sendText(phone, pergunta);
}

// Reescreve descricoes de alimentos que vieram do Claude no formato AGREGADO
// (ex: "Arroz (~200g x2 pratos)") pra porcao individual depois da divisao por
// N pessoas em resolverAmbiguidadeFoto. Estrategia heuristica local (sem API).
//
// Padroes que os prompts do Sonnet 4.6 costumam gerar (UAT 2026-07-09):
//  - "Arroz branco (~200g x2 pratos)"                                → "Arroz branco (~200g)"
//  - "Arroz ~200g por prato, 2 pratos = ~400g total"                 → "Arroz ~200g"
//  - "Carne 300g no total"        (com n=3)                          → "Carne 100g"
//  - "Salada 80g cada"                                               → "Salada 80g"
//  - "Feijão 200ml em cada prato"                                    → "Feijão 200ml"
//  - "Macarrão (~150g + tigela extra ~200g)"                         → "Macarrão (~150g)"
//  - "Farofa (~80g tigela extra)"                                    → "Farofa (~80g)"
//
// Se n <= 1, retorna intacto.
export function normalizarDescricoesIndividuais(alimentos: string[], n: number): string[] {
  if (n <= 1) return alimentos;
  return alimentos.map((a) => normalizarUmAlimento(a, n));
}

// Sufixos por-unidade: quando presentes, a quantidade JA e individual — so cortar
// o sufixo. Cobre "por prato", "x2 pratos", "cada", "+ tigela extra", "tigela extra".
const SUFIXOS_POR_UNIDADE: RegExp[] = [
  /\s*[,;]?\s+por\s+(?:prato|pessoa|porç[aã]o|porcao|unidade)s?\b[\s\S]*$/i,
  /\s*[,;]?\s+x\s*\d+\s+(?:pratos?|pessoas?|porç[aã]o|porcao|unidades?)\b[\s\S]*$/i,
  /\s*[,;]?\s+(?:em\s+)?cada\b[\s\S]*$/i,
  /\s*[,;]?\s+\+\s+(?:tigela|prato|bandeja|porç[aã]o|porcao)\s+extra\b[\s\S]*$/i,
  /\s*[,;]?\s+(?:na|no)\s+(?:tigela|prato|bandeja)\s+extra\b[\s\S]*$/i,
  /\s*[,;]?\s+(?:tigela|prato|bandeja)\s+extra\b[\s\S]*$/i,
];

// "Xg total" / "Xg no total" imediatamente antes do fim: quantidade e agregada,
// deve ser dividida. Ancorado em \s+ para nao confundir com "total" em substring.
const REGEX_TOTAL_NUM = /^(.+?)([~≈]?\s*)([\d]+(?:[.,][\d]+)?)\s*(g|ml|kcal)\s*(?:no\s+)?total\b\.?\s*$/i;

// Sufixo "total" isolado (quando nao ha numero pra dividir): so trunca.
const SUFIXO_TOTAL_ISOLADO = /[,;]?\s*(?:no\s+)?total\b\.?\s*$/i;

function normalizarUmAlimento(desc: string, n: number): string {
  const original = desc.trim();

  // Padrao "Nome (conteudo)": processa dentro dos parenteses para preservar
  // o wrapper visual do card D-06.
  const parenteses = original.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (parenteses) {
    const nome = parenteses[1].trim();
    const conteudo = parenteses[2].trim();
    const processado = processarConteudo(conteudo, n);
    return processado === '' ? nome : `${nome} (${processado})`;
  }

  return processarConteudo(original, n);
}

// Ordem: (1) sufixos por-unidade truncados; (2) "Xg total" dividido; (3) "total"
// isolado truncado. Nunca combina os dois — o primeiro que casar decide.
function processarConteudo(str: string, n: number): string {
  for (const r of SUFIXOS_POR_UNIDADE) {
    const novo = str.replace(r, '').trim();
    if (novo !== str) return novo;
  }
  const m = str.match(REGEX_TOTAL_NUM);
  if (m) {
    const dividido = dividirTotal(m, n);
    if (dividido) return dividido;
  }
  return str.replace(SUFIXO_TOTAL_ISOLADO, '').trim();
}

function dividirTotal(m: RegExpMatchArray, n: number): string | null {
  const prefixo = m[1].trim();
  const tilde = m[2].trim();
  const valor = parseFloat(m[3].replace(',', '.'));
  const unidade = m[4];
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const dividido = Math.round(valor / n);
  return `${prefixo} ${tilde}${dividido}${unidade}`.trim();
}

// Chamado por agent.ts quando o paciente responde a pergunta de ambiguidade.
// Retorna true se resolveu, false se resposta invalida (agent.ts re-pergunta).
export async function resolverAmbiguidadeFoto(
  phone: string,
  paciente: PacienteInfo,
  pendente: { tipo: 'pessoas' | 'refeicoes'; analise: AnalisePrato },
  textoBruto: string,
): Promise<boolean> {
  const texto = textoBruto.toLowerCase().trim();
  const estado = await getEstado(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);

  if (pendente.tipo === 'pessoas') {
    let n = 0;
    // Lookaround (?<!\w)/(?!\w) em vez de \b porque \b em JS eh ASCII-only —
    // depois de `só` (o char `ó` nao eh word char ASCII) o boundary falha.
    if (/(?<!\w)(s[óo]\s*eu|somente\s*eu|s[óo]\s*(pra|para)\s*mim)(?!\w)/.test(texto)) {
      n = 1;
    } else {
      const m = texto.match(/\b(\d+)\b/);
      if (m) n = parseInt(m[1], 10);
    }
    if (n < 1 || n > 20) return false;
    await atualizarEstado(paciente.id, {
      dados: { foto_ambigua_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'],
    });
    if (n === 1) {
      await handleConfirmacaoPrato(phone, paciente, pendente.analise, metas);
    } else {
      const divididos: AnalisePrato = {
        ...pendente.analise,
        alimentos: normalizarDescricoesIndividuais(pendente.analise.alimentos, n),
        macros: {
          kcal:       pendente.analise.macros.kcal / n,
          proteina_g: pendente.analise.macros.proteina_g / n,
          carbo_g:    pendente.analise.macros.carbo_g / n,
          gordura_g:  pendente.analise.macros.gordura_g / n,
        },
        aviso: `Porção dividida por ${n} pessoas.`,
      };
      await handleConfirmacaoPrato(phone, paciente, divididos, metas);
    }
    return true;
  }

  // tipo === 'refeicoes' — lookaround em vez de \b por causa do `ó` unicode.
  if (/(?<!\w)(uma\s*s[óo]|junto|junta|1|s[óo]\s*uma)(?!\w)/.test(texto)) {
    await atualizarEstado(paciente.id, {
      dados: { foto_ambigua_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'],
    });
    await handleConfirmacaoPrato(phone, paciente, pendente.analise, metas);
    return true;
  }
  if (/(?<!\w)(separad[ao]s?|separar|separa|distintas?)(?!\w)/.test(texto)) {
    await atualizarEstado(paciente.id, {
      dados: { foto_ambigua_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'],
    });
    // Fallback: Claude nao devolveu split — cai no agregado
    if (!pendente.analise.refeicoes || pendente.analise.refeicoes.length < 2) {
      await handleConfirmacaoPrato(phone, paciente, pendente.analise, metas);
      return true;
    }
    for (const r of pendente.analise.refeicoes) {
      const descricao = r.alimentos.join(', ');
      await registrarRefeicao(paciente.id, descricao, r.macros, 'foto');
    }
    const saldo = await obterSaldoDia(paciente.id);
    const streak = await calcularStreak(paciente.id, metas);
    const linhas = pendente.analise.refeicoes
      .map((r, i) => `📸 *Refeição ${i + 1}:* ${r.alimentos.join(', ')} (~${Math.round(r.macros.kcal)} kcal)`)
      .join('\n');
    const totalKcal = pendente.analise.macros.kcal;
    const cabecalho = `✅ *${pendente.analise.refeicoes.length} refeições registradas!*\n\n${linhas}\n\n_Total:_ ${Math.round(totalKcal)} kcal`;
    await sendText(phone, `${cabecalho}\n\n${formatarBlocoProgressoDia(saldo, metas, streak)}`);
    await dispararAlertaOvershoot(phone, saldo, metas);
    return true;
  }
  return false;
}
