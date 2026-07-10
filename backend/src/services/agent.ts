import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { sendText } from './evolution';
import { query as ragQuery, buscarHorariosDietaPaciente } from './rag';
import {
  buscarPacientePorWhatsapp,
  getEstado,
  atualizarEstado,
  EstadoEntrevista,
  ObjetivoNutricional,
  PacienteInfo,
} from './conversation';
import * as mealService from './meal';
import * as visionService from './vision';
import {
  calcularTMB,
  calcularHidratacao,
  calcularCreatina,
  calcularMacros,
  obterMetas,
  gerarExplicacaoPersonalizada,
  formatarMensagemCalculos,
  DadosEntrevista,
} from './calculos';
import { sincronizarAlertasDaEntrevista } from './alertas';
import { classificarIntencao, mencionaAguaCombinada, removerMencaoAgua } from './intent';
import { analisarSuplementos, formatarAvisoControlados } from './suplementos';
import {
  registrarMensagem,
  obterUltimasMensagens,
  ConversaMensagem,
} from './conversaHistorico';
import { hojeLocal } from '../utils/datas';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

// D-03: Acumular agua via RPC. Versao silenciosa — usada tanto pelo handler
// dedicado quanto quando a agua vem misturada numa mensagem de refeicao
// ("comi X com 500ml de agua"), sem enviar mensagem propria pra nao duplicar
// o card da refeicao.
async function registrarAguaContador(pacienteId: string, aguaMl: number): Promise<boolean> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const hoje = hojeLocal();
  const { error } = await supabase.rpc('registrar_agua_diaria', {
    p_paciente_id: pacienteId,
    p_data: hoje,
    p_agua_ml: aguaMl,
  });
  if (error) {
    console.error('[agent] Erro ao registrar agua:', error.message);
    return false;
  }
  return true;
}

async function registrarAgua(pacienteId: string, aguaMl: number): Promise<string> {
  const ok = await registrarAguaContador(pacienteId, aguaMl);
  if (!ok) return `⚠️ Erro ao registrar hidratação. Tente novamente.`;
  return `💧 *${aguaMl}ml* de água registrados! Continue se hidratando. 💚`;
}

// Extrai ml de agua de uma mensagem. Suporta "500ml", "2 litros", "3 copos"
// (copo = 250ml). Retorna 0 se nao detectar quantidade.
function extrairAguaMl(texto: string): number {
  const matchMl = texto.match(/(\d+)\s*ml/i);
  if (matchMl) return parseInt(matchMl[1], 10);
  const matchLitro = texto.match(/(\d+(?:[.,]\d+)?)\s*litros?/i);
  if (matchLitro) return Math.round(parseFloat(matchLitro[1].replace(',', '.')) * 1000);
  const matchCopo = texto.match(/(\d+)\s*copos?/i);
  if (matchCopo) return parseInt(matchCopo[1], 10) * 250;
  return 0;
}

const TOTAL_ETAPAS = 14;

const PERGUNTAS_ENTREVISTA: Record<number, string> = {
  1: '📋 Vamos iniciar sua avaliacao! *Qual e a sua idade?*',
  2: '🎯 *Qual e o seu objetivo principal?*\n\n' +
     '1️⃣ Emagrecer\n' +
     '2️⃣ Ganhar massa\n' +
     '3️⃣ Manter o peso\n' +
     '4️⃣ Saude geral\n\n' +
     'Responda com o numero ou descreva (ex: "perder peso").',
  3: '👤 *Qual e o seu sexo?* (masculino/feminino)',
  4: '⚖️ *Qual e o seu peso atual em kg?* (ex: 75 ou 70,5)',
  5: '📏 *Qual e a sua altura?* (em cm como 175, ou em metros como 1,75)',
  6: '🏃 *Que tipo de atividade fisica voce pratica?* (musculacao, corrida, caminhada, ou "sedentario")',
  7: '📅 *Com que frequencia voce treina?* (ex: 3x por semana, ou "nao treino")',
  8: '⏰ *Em que horario voce costuma treinar?* (ex: 18h, "de manha", ou "nao treino")',
  9: '🌙 *Que horas voce costuma acordar e dormir?* (ex: 6h / 23h)',
  10: '⚠️ *Voce tem alergias, intolerancias ou condicoes de saude?* (ex: lactose, gluten, diabetes, hipertensao).\n\nSe nao tiver, responda "nenhuma".',
  11: '🚫 *Tem algum alimento que voce NAO come ou tem aversao?* (ex: peixe, quiabo, frutos do mar).\n\nSe nao tiver, responda "nenhuma".',
  12: '📖 *Voce ja fez dieta antes?* Conte rapidamente o que funcionou ou nao funcionou pra voce. Se for a primeira vez, responda "nunca".',
  13: '💊 *Voce usa algum suplemento hoje?* Se sim, quais (separados por virgula). Se nao, responda "nao uso".',
  14: '🍽️ *Em quais horarios voce costuma fazer suas refeicoes?*\n\n' +
      'Voce pode mandar 3 (cafe, almoco, jantar) ou 5 (incluindo lanches da manha/tarde).\n\n' +
      'Ex: "cafe 7h, almoco 12h30, jantar 20h"\n' +
      'Ou: "7h, 10h, 12h30, 16h, 20h"',
};

// "nenhuma"/"nenhum"/"nao tenho"/"nao uso" tratados como resposta valida = lista vazia
const NEGATIVA_LISTA_RE = /^(nao|não)(\s+(tenho|uso|come|como))?$|^(nenhum[ao]?|nenhuns)$/;

function parseListaOuVazio(texto: string): string[] {
  const t = texto.toLowerCase().trim();
  if (NEGATIVA_LISTA_RE.test(t)) return [];
  return texto.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function parseObjetivo(texto: string): ObjetivoNutricional | null {
  const t = texto.toLowerCase().trim();
  // Atalhos numericos
  if (t === '1') return 'emagrecer';
  if (t === '2') return 'ganhar_massa';
  if (t === '3') return 'manter';
  if (t === '4') return 'saude_geral';
  // Keywords (ordem importa: "ganhar peso" nao deve cair em emagrecer pelo "peso")
  if (/ganhar|massa|hipertro|muscul/.test(t)) return 'ganhar_massa';
  if (/emagre|perder|gordura|secar|peso\b/.test(t)) return 'emagrecer';
  if (/mant|estab/.test(t)) return 'manter';
  if (/saud|geral|equil|bem.?estar/.test(t)) return 'saude_geral';
  return null;
}

function parsePeso(texto: string): number | null {
  const limpo = texto.toLowerCase().replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(limpo);
  if (isNaN(num) || num < 30 || num > 300) return null;
  return num;
}

// Aceita cm (100-250) ou metros (1.0-2.5), normaliza para cm inteiro.
function parseAltura(texto: string): number | null {
  const limpo = texto.toLowerCase().replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(limpo);
  if (isNaN(num)) return null;
  if (num >= 1 && num < 3) return Math.round(num * 100);
  if (num >= 100 && num <= 250) return Math.round(num);
  return null;
}

// Tenta extrair 2 numeros (0-23) como horas acordar/dormir.
// Fallback: salva texto cru pra nao prender o usuario.
function parseRotinaHorarios(texto: string): {
  rotina_acordar?: number;
  rotina_dormir?: number;
  rotina_horarios_raw?: string;
} {
  const nums = texto.match(/\d{1,2}/g);
  if (nums && nums.length >= 2) {
    const a = parseInt(nums[0], 10);
    const d = parseInt(nums[1], 10);
    if (a >= 0 && a <= 23 && d >= 0 && d <= 23) {
      return { rotina_acordar: a, rotina_dormir: d };
    }
  }
  return { rotina_horarios_raw: texto.trim() };
}

// Normaliza um match HH:MM (capturas 1=hora, 2=minuto opcional) → "HH:MM" 0-padded.
// Retorna null se hora/minuto fora de range.
function formatarHoraValida(h: number, m: number): string | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Parser tolerante de horarios das refeicoes.
// Estrategia 1: detectar palavra-chave (cafe/almoco/jantar/lanche...) +
// horario na vizinhanca → mapa key→HH:MM.
// Estrategia 2 (fallback): se nenhuma keyword bateu, extrai TODOS os
// horarios em ordem e mapeia por posicao (3 → cafe/almoco/jantar;
// 5+ → cafe/lanche_manha/almoco/lanche_tarde/jantar).
// Aceita "7h", "7:00", "7h00", "19h30", "12:30".
function parseHorariosRefeicoes(texto: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  const t = texto.toLowerCase();
  const horaRe = /(\d{1,2})[:hH](?:(\d{2}))?/g;

  // Estrategia 1: palavra-chave + horario proximo (janela de 25 chars depois)
  const keywords: Array<[string, RegExp]> = [
    // ordem importa: "lanche_manha" e "lanche_tarde" devem casar antes que
    // o "lanche" generico caia em "cafe" (que tambem inclui "manha")
    ['lanche_manha', /(lanche[^,;.]{0,15}(manh|manh[ãa])|colac[aã]o|colacao)/],
    ['lanche_tarde', /(lanche[^,;.]{0,15}tarde|merenda|tarde[^,;.]{0,15}lanche)/],
    ['cafe', /(caf[eé](?:\s+da\s+manh[ãa])?|manh[ãa]\b)/],
    ['almoco', /(almo[çc]?o)/],
    ['jantar', /(jantar|janta\b|ceia|noite\b)/],
  ];

  const ocupados = new Set<number>(); // chars ja usados para nao reaproveitar
  for (const [key, kwRe] of keywords) {
    const kwMatch = t.match(kwRe);
    if (!kwMatch) continue;
    const idx = kwMatch.index ?? 0;
    if ([...Array(kwMatch[0].length).keys()].some((i) => ocupados.has(idx + i))) continue;
    // janela: da keyword ate 25 chars depois (cobre "almoco 12h30")
    const janela = t.slice(idx, Math.min(t.length, idx + kwMatch[0].length + 25));
    const horaMatch = janela.match(/(\d{1,2})[:hH](?:(\d{2}))?/);
    if (!horaMatch) continue;
    const h = parseInt(horaMatch[1], 10);
    const m = horaMatch[2] ? parseInt(horaMatch[2], 10) : 0;
    const hora = formatarHoraValida(h, m);
    if (!hora) continue;
    resultado[key] = hora;
    // marca keyword + horario como ocupados para nao reusar
    const horaIdx = (horaMatch.index ?? 0) + idx;
    for (let i = idx; i < idx + kwMatch[0].length; i++) ocupados.add(i);
    for (let i = horaIdx; i < horaIdx + horaMatch[0].length; i++) ocupados.add(i);
  }

  if (Object.keys(resultado).length > 0) return resultado;

  // Estrategia 2: fallback por ordem
  const todasHoras = [...t.matchAll(horaRe)]
    .map((m) => {
      const h = parseInt(m[1], 10);
      const mm = m[2] ? parseInt(m[2], 10) : 0;
      return formatarHoraValida(h, mm);
    })
    .filter((x): x is string => x !== null);

  if (todasHoras.length === 3) {
    const keys = ['cafe', 'almoco', 'jantar'];
    todasHoras.forEach((h, i) => { resultado[keys[i]] = h; });
  } else if (todasHoras.length >= 5) {
    const keys = ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar'];
    for (let i = 0; i < 5; i++) resultado[keys[i]] = todasHoras[i];
  }

  return resultado;
}

// Extrai todos os horarios validos do texto em ordem de aparicao, sem mapear
// para refeicoes. Usado pelo fluxo "parcial" da etapa 14 (P1-6) quando o
// paciente envia so as horas dos faltantes — ex: "10h e 16h" quando faltam
// lanche_manha e lanche_tarde. Aceita "7h", "7:00", "7h00", "19h30", "12:30".
function extrairHorariosEmOrdem(texto: string): string[] {
  const horaRe = /(\d{1,2})[:hH](?:(\d{2}))?/g;
  return [...texto.toLowerCase().matchAll(horaRe)]
    .map((m) => {
      const h = parseInt(m[1], 10);
      const mm = m[2] ? parseInt(m[2], 10) : 0;
      return formatarHoraValida(h, mm);
    })
    .filter((x): x is string => x !== null);
}

// === P1-6: helpers da etapa 14 quando o PDF da dieta ja traz horarios ===

type RefeicaoKey = 'cafe' | 'lanche_manha' | 'almoco' | 'lanche_tarde' | 'jantar';

const LABEL_REFEICAO: Record<RefeicaoKey, string> = {
  cafe: '☕ Cafe',
  lanche_manha: '🥪 Lanche da manha',
  almoco: '🍽️ Almoco',
  lanche_tarde: '🍎 Lanche da tarde',
  jantar: '🌙 Jantar',
};

// "07:00" → "7h"; "07:30" → "7h30"; "12:30" → "12h30"
function formatarHoraLabel(hhmm: string): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return mm === 0 ? `${h}h` : `${h}h${m[2]}`;
}

const REFEICAO_KEYS_ORDEM: RefeicaoKey[] = ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar'];

interface PerguntaEtapa14 {
  mensagem: string;
  // Campos pra mesclar em entrevista_dados antes de mandar a pergunta.
  // confirmacao_horarios_pendente = true → "sim" usa pre_extraidos; "nao" cai
  // em pergunta aberta. confirmacao_horarios_pendente = 'parcial' → o paciente
  // responde so os faltantes, o parser mescla com horarios_pre_extraidos.
  dadosExtras: Record<string, unknown>;
}

export async function prepararPerguntaEtapa14(pacienteId: string): Promise<PerguntaEtapa14> {
  const horarios = await buscarHorariosDietaPaciente(pacienteId);
  if (!horarios) {
    return { mensagem: PERGUNTAS_ENTREVISTA[14], dadosExtras: {} };
  }

  const preenchidos: Array<[RefeicaoKey, string]> = [];
  const faltantes: RefeicaoKey[] = [];
  for (const k of REFEICAO_KEYS_ORDEM) {
    const v = horarios[k];
    if (typeof v === 'string' && v.length > 0) preenchidos.push([k, v]);
    else faltantes.push(k);
  }

  if (faltantes.length === 0) {
    const linhas = preenchidos.map(([k, h]) => `${LABEL_REFEICAO[k]} — ${formatarHoraLabel(h)}`);
    const mensagem =
      `🍽️ *Vi na sua dieta os seguintes horarios:*\n\n` +
      linhas.join('\n') +
      `\n\nConfere? (responda *sim* ou *nao*)`;
    return {
      mensagem,
      dadosExtras: {
        confirmacao_horarios_pendente: 'completa',
        horarios_pre_extraidos: Object.fromEntries(preenchidos),
      },
    };
  }

  // Parcial: confirmar o que tem + pedir o que falta numa frase so
  const linhasPreenchidas = preenchidos
    .map(([k, h]) => `${LABEL_REFEICAO[k]} — ${formatarHoraLabel(h)}`)
    .join(', ');
  const labelsFaltantes = faltantes
    .map((k) => LABEL_REFEICAO[k].replace(/^[^\s]+\s/, ''))
    .join(', ');
  const mensagem =
    `🍽️ *Vi na sua dieta:* ${linhasPreenchidas}.\n\n` +
    `Que horas voce costuma fazer *${labelsFaltantes}*?\n` +
    `(ex: "10h e 16h")`;
  return {
    mensagem,
    dadosExtras: {
      confirmacao_horarios_pendente: 'parcial',
      horarios_pre_extraidos: Object.fromEntries(preenchidos),
    },
  };
}

const SIM_RE = /^(sim|s|yes|confirmo|confere|ok|certo)\b/i;
const NAO_RE = /^(n[aã]o|n|no|nao confere|errado)\b/i;

interface RespostaEtapa14Especial {
  handled: boolean;
  // Quando handled=true, o caller usa esses campos pro fluxo.
  // novoDado: dados a serem mesclados (horarios_refeicoes + limpeza de flags).
  // mensagemRepetir: se preenchido, repete sem avancar etapa.
  novoDado?: Partial<EstadoEntrevista['dados']>;
  mensagemRepetir?: string;
}

// Retorna handled=true quando o caso e "confirmacao do PDF". handled=false
// significa "cai no parser tradicional" (texto livre na pergunta aberta).
export function tratarRespostaConfirmacaoHorarios(
  texto: string,
  dados: EstadoEntrevista['dados'],
): RespostaEtapa14Especial {
  const flag = (dados as Record<string, unknown>)['confirmacao_horarios_pendente'];
  const pre = (dados as Record<string, unknown>)['horarios_pre_extraidos'] as
    | Record<string, string>
    | undefined;
  if (!flag || !pre) return { handled: false };

  const t = texto.trim();

  if (flag === 'completa') {
    if (SIM_RE.test(t)) {
      return {
        handled: true,
        novoDado: {
          horarios_refeicoes: pre,
          // limpar flags do estado
          confirmacao_horarios_pendente: null,
          horarios_pre_extraidos: null,
        } as Partial<EstadoEntrevista['dados']>,
      };
    }
    if (NAO_RE.test(t)) {
      // Sinaliza: limpar flag e mandar pergunta aberta agora, sem avancar
      return {
        handled: true,
        mensagemRepetir: PERGUNTAS_ENTREVISTA[14],
        novoDado: {
          confirmacao_horarios_pendente: null,
          horarios_pre_extraidos: null,
        } as Partial<EstadoEntrevista['dados']>,
      };
    }
    // resposta nao reconhecida → pedir sim/nao explicito
    return {
      handled: true,
      mensagemRepetir: '❓ Responda *sim* se os horarios conferem ou *nao* para informar diferentes.',
    };
  }

  if (flag === 'parcial') {
    // Esperamos os faltantes em texto livre. Estrategia em camadas:
    // 1. parseHorariosRefeicoes (rotulado ou ordem-3/5 — cobre "cafe 8h",
    //    "lanche da manha 10h, lanche da tarde 16h").
    // 2. Fallback: extrair todos os horarios em ordem e mapear nos faltantes
    //    quando a quantidade bate. Cobre "10h e 16h" quando faltam dois (a
    //    sugestao da mensagem parcial implica exatamente isso).
    const faltantes = REFEICAO_KEYS_ORDEM.filter((k) => !(k in pre));
    const rotulados = parseHorariosRefeicoes(texto);
    let novos: Record<string, string> = rotulados;
    if (Object.keys(rotulados).length === 0) {
      const horasEmOrdem = extrairHorariosEmOrdem(texto);
      if (horasEmOrdem.length === faltantes.length && faltantes.length > 0) {
        novos = {};
        faltantes.forEach((k, i) => { novos[k] = horasEmOrdem[i]; });
      }
    }
    if (Object.keys(novos).length === 0) {
      return {
        handled: true,
        mensagemRepetir: '❓ Nao entendi os horarios. Tente algo como "10h e 16h".',
      };
    }
    const mesclado: Record<string, string> = { ...pre, ...novos };
    return {
      handled: true,
      novoDado: {
        horarios_refeicoes: mesclado,
        confirmacao_horarios_pendente: null,
        horarios_pre_extraidos: null,
      } as Partial<EstadoEntrevista['dados']>,
    };
  }

  return { handled: false };
}

async function processarRespostaEntrevista(
  _pacienteId: string,
  etapa: number,
  texto: string,
  _dados: EstadoEntrevista['dados'],
): Promise<Partial<EstadoEntrevista['dados']>> {
  const novoDado: Partial<EstadoEntrevista['dados']> = {};
  const textoLower = texto.toLowerCase().trim();

  switch (etapa) {
    case 1: {
      const idade = parseInt(textoLower.replace(/\D/g, ''), 10);
      if (isNaN(idade) || idade < 10 || idade > 120) return {};
      novoDado.idade = idade;
      break;
    }
    case 2: {
      const obj = parseObjetivo(texto);
      if (!obj) return {};
      novoDado.objetivo = obj;
      break;
    }
    case 3: {
      if (textoLower.includes('masc') || textoLower === 'm') novoDado.sexo = 'masculino';
      else if (textoLower.includes('fem') || textoLower === 'f') novoDado.sexo = 'feminino';
      else return {};
      break;
    }
    case 4: {
      const peso = parsePeso(texto);
      if (peso === null) return {};
      novoDado.peso_kg = peso;
      break;
    }
    case 5: {
      const altura = parseAltura(texto);
      if (altura === null) return {};
      novoDado.altura_cm = altura;
      break;
    }
    case 6: {
      novoDado.atividade_tipo = texto.trim();
      break;
    }
    case 7: {
      novoDado.atividade_frequencia = texto.trim();
      break;
    }
    case 8: {
      // Texto livre sem extracao estruturada — "18h", "manha", "nao treino" todos validos
      novoDado.atividade_horario = texto.trim();
      break;
    }
    case 9: {
      Object.assign(novoDado, parseRotinaHorarios(texto));
      break;
    }
    case 10: {
      novoDado.restricoes = parseListaOuVazio(texto);
      break;
    }
    case 11: {
      novoDado.preferencias_recusas = parseListaOuVazio(texto);
      break;
    }
    case 12: {
      // "nunca"/"primeira vez" normalizados; resto fica como contou
      if (/^(nunca|primeira\s+vez|nao|não)$/.test(textoLower)) {
        novoDado.experiencia_dieta = 'nunca';
      } else {
        novoDado.experiencia_dieta = texto.trim();
      }
      break;
    }
    case 13: {
      novoDado.suplementos = parseListaOuVazio(texto);
      break;
    }
    case 14: {
      const horarios = parseHorariosRefeicoes(texto);
      // Minimo: 2 horarios identificados — abaixo disso o usuario
      // provavelmente nao entendeu o formato e repetimos a pergunta.
      if (Object.keys(horarios).length < 2) return {};
      novoDado.horarios_refeicoes = horarios;
      break;
    }
  }

  return novoDado;
}

interface PerfilNutricional {
  objetivo?: ObjetivoNutricional;
  restricoes?: string[];
  preferencias_recusas?: string[];
}

const OBJETIVO_LABEL: Record<ObjetivoNutricional, string> = {
  emagrecer: 'emagrecer (perder gordura)',
  ganhar_massa: 'ganhar massa muscular',
  manter: 'manter o peso atual',
  saude_geral: 'saude geral / bem-estar',
};

async function responderComClaude(
  perguntaUsuario: string,
  contextoRag: string,
  nomePaciente: string,
  perfil: PerfilNutricional,
  historico: ConversaMensagem[] = [],
): Promise<string> {
  const objetivoLinha = perfil.objetivo
    ? OBJETIVO_LABEL[perfil.objetivo]
    : 'nao informado';
  const restricoesLinha = perfil.restricoes && perfil.restricoes.length > 0
    ? perfil.restricoes.join(', ')
    : 'nenhuma';
  const aversoesLinha = perfil.preferencias_recusas && perfil.preferencias_recusas.length > 0
    ? perfil.preferencias_recusas.join(', ')
    : 'nenhuma';

  const systemPrompt = `Voce e o NutriChat, assistente nutricional do WhatsApp.
Seu nutricionista prescreveu uma dieta especifica para voce, ${nomePaciente}.

PERFIL DO PACIENTE:
- Objetivo principal: ${objetivoLinha}
- Restricoes / condicoes de saude: ${restricoesLinha}
- Alimentos recusados / aversoes: ${aversoesLinha}

REGRAS DE SEGURANCA (inegociaveis):
- NUNCA sugira ou recomende alimento listado nas restricoes ou aversoes do paciente
- Se a pergunta envolver um alimento restrito, AVISE explicitamente e proponha alternativa segura
- Toda recomendacao deve respeitar o objetivo principal do paciente

Contexto da sua dieta (trechos relevantes do PDF prescrito):
${contextoRag || 'Nenhum trecho especifico da dieta bateu com esta pergunta no momento — mas a dieta dele JA ESTA processada no sistema. Responda com principios gerais de nutricao adequados ao perfil dele, e sugira que ele reformule a pergunta sendo mais especifico (ex: "qual cafe da manha?" em vez de "qual minha dieta?") se quiser detalhes especificos do PDF. Nao diga que a dieta nao foi carregada.'}

Regras de comunicacao:
- Responda sempre em portugues, de forma amigavel e direta
- Mantenha respostas curtas (max 3 paragrafos) — e WhatsApp, nao email
- Nunca invente informacoes nutricionais especificas sem base no contexto da dieta
- Use emojis com moderacao`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: [...historico, { role: 'user', content: perguntaUsuario }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// AGENT-18: decide se o lembrete de vencimento deve sair NESTA mensagem.
// Pura pra ser testavel: null = nao avisar (fora da janela de 3 dias ou ja
// avisado hoje). `agoraMs` injetavel so nos testes.
export function avisoVencimentoPendente(
  paciente: PacienteInfo,
  hoje: string,
  agoraMs: number = Date.now(),
): string | null {
  if (!paciente.data_expiracao) return null;
  const dataExp = new Date(paciente.data_expiracao as string);
  const diasParaVencer = Math.ceil((dataExp.getTime() - agoraMs) / (1000 * 60 * 60 * 24));
  if (diasParaVencer <= 0 || diasParaVencer > 3) return null;
  const dados = (paciente.entrevista_dados ?? {}) as Record<string, unknown>;
  if (dados['ultimo_aviso_expiracao'] === hoje) return null;
  const diasStr = diasParaVencer === 1 ? '1 dia' : `${diasParaVencer} dias`;
  return `⚠️ Lembrete: seu plano NutriChat vence em *${diasStr}*. Renove com seu nutricionista para nao perder o acompanhamento. 💚`;
}

export async function processarMensagem(phone: string, texto: string): Promise<void> {
  // 1. Buscar paciente pelo numero
  const paciente = await buscarPacientePorWhatsapp(phone);

  if (!paciente) {
    await sendText(phone, '😕 Seu numero nao esta cadastrado. Fale com seu nutricionista.');
    return;
  }

  // Bloqueio: plano inativo OU data de expiracao ja passou.
  // Defesa em camadas — nao depende do cron de expiracao ter rodado.
  const hoje = hojeLocal();
  const expirouPorData = !!paciente.data_expiracao && (paciente.data_expiracao as string) < hoje;

  if (!paciente.ativo || expirouPorData) {
    await sendText(phone, '⏰ Seu plano NutriChat expirou. Entre em contato com seu nutricionista para renovar e voltar a receber acompanhamento. 💚');
    return;
  }

  // AGENT-18: aviso reativo quando plano vence em <= 3 dias. No maximo UMA
  // vez por dia — sem a trava, TODA mensagem dos 3 dias finais vinha
  // prefixada com o lembrete (paciente ativo recebia o aviso dezenas de
  // vezes ao dia). ultimo_aviso_expiracao vive em entrevista_dados.
  const aviso = avisoVencimentoPendente(paciente, hoje);
  if (aviso) {
    await sendText(phone, aviso);
    try {
      await atualizarEstado(paciente.id, {
        dados: { ultimo_aviso_expiracao: hoje } as Parameters<typeof atualizarEstado>[1]['dados'],
      });
    } catch (err) {
      console.error('[agent] Falha ao marcar ultimo_aviso_expiracao:', err);
    }
  }

  // 2. Verificar estado da entrevista
  const estado = await getEstado(paciente.id);

  // 3. Entrevista pendente — iniciar
  if (estado.status === 'pendente') {
    await atualizarEstado(paciente.id, { status: 'em_andamento', etapa: 1 });
    await sendText(
      phone,
      `Ola, ${paciente.nome}! 👋 Sou o *NutriChat*, seu assistente nutricional.\n\n` +
      `Vou te ajudar a acompanhar sua dieta diariamente pelo WhatsApp. 🥗\n\n` +
      PERGUNTAS_ENTREVISTA[1],
    );
    return;
  }

  // 4. Entrevista em andamento — coletar dados
  if (estado.status === 'em_andamento') {
    const etapa = estado.etapa;

    // P1-6: na etapa 14 podemos estar em modo de confirmacao do PDF da dieta
    // ou em modo de coleta dos faltantes. tratarRespostaConfirmacaoHorarios
    // resolve esses dois caminhos; handled=false delega ao parser tradicional.
    let novoDado: Partial<EstadoEntrevista['dados']> = {};
    let pulouProximaEtapa = false;
    if (etapa === 14) {
      const especial = tratarRespostaConfirmacaoHorarios(texto, estado.dados);
      if (especial.handled) {
        if (especial.mensagemRepetir) {
          // Limpa flags se houver e repete (nao avanca etapa)
          if (especial.novoDado) {
            await atualizarEstado(paciente.id, { dados: especial.novoDado });
          }
          await sendText(phone, especial.mensagemRepetir);
          return;
        }
        novoDado = especial.novoDado ?? {};
        pulouProximaEtapa = true; // ja temos horarios_refeicoes
      }
    }

    if (!pulouProximaEtapa) {
      novoDado = await processarRespostaEntrevista(paciente.id, etapa, texto, estado.dados);
    }

    if (Object.keys(novoDado).length === 0) {
      // Resposta invalida — repetir pergunta
      await sendText(phone, `❓ Nao entendi. ${PERGUNTAS_ENTREVISTA[etapa]}`);
      return;
    }

    const proximaEtapa = etapa + 1;

    if (proximaEtapa > TOTAL_ETAPAS) {
      // Merge final dos dados de entrevista (inclui objetivo + restricoes coletados nas novas etapas)
      const dadosCompletos = { ...estado.dados, ...novoDado } as DadosEntrevista & {
        objetivo?: ObjetivoNutricional;
        restricoes?: string[];
        horarios_refeicoes?: Record<string, string>;
      };

      // Calcular numeros personalizados
      const tmb = calcularTMB(dadosCompletos);
      const hidratacao = calcularHidratacao(dadosCompletos.peso_kg);
      const creatina = calcularCreatina(dadosCompletos.peso_kg, dadosCompletos.suplementos);
      const macros = calcularMacros(tmb.tdee_kcal, dadosCompletos.objetivo, dadosCompletos.peso_kg);

      // Persistir dados completos + metricas + metas_* em uma unica atualizacao atomica.
      // metas_* viram fonte de verdade pra meal.ts/vision.ts/agent.ts via obterMetas.
      await atualizarEstado(paciente.id, {
        status: 'completa',
        etapa: TOTAL_ETAPAS,
        dados: {
          ...dadosCompletos,
          tmb_kcal: tmb.tmb_kcal,
          tdee_kcal: tmb.tdee_kcal,
          hidratacao_ml: hidratacao.meta_ml,
          creatina_g: creatina.dose_g,
          metas_kcal: macros.kcal,
          metas_proteina_g: macros.proteina_g,
          metas_carbo_g: macros.carbo_g,
          metas_gordura_g: macros.gordura_g,
        },
      });

      // Sincronizar horarios das refeicoes -> alertas_config para o cron de lembretes.
      // Try/catch isolado: falha de sync NAO pode derrubar a confirmacao da entrevista.
      try {
        await sincronizarAlertasDaEntrevista(paciente.id, dadosCompletos.horarios_refeicoes);
      } catch (err) {
        console.error('[agent] Falha ao sincronizar alertas_config:', err);
      }

      // Confirmacao da entrevista
      await sendText(
        phone,
        `✅ Perfeito, ${paciente.nome}! Entrevista concluida.\n\n` +
        `Calculando seus numeros personalizados... ⏳`,
      );

      // Pequeno delay para parecer processamento (UX)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Msg 1: numeros (TMB/TDEE + macros + hidratacao + creatina)
      await sendText(phone, formatarMensagemCalculos(tmb, macros, hidratacao, creatina));

      // P0-3: flag de suplementos controlados (anabolizantes, hormonios, doping).
      // Se ha algum, envia aviso ao paciente e persiste em entrevista_dados pro
      // nutricionista ver no painel. Try/catch isolado — nao bloqueia a entrevista.
      try {
        const analise = analisarSuplementos(dadosCompletos.suplementos);
        if (analise.controlados.length > 0) {
          await sendText(phone, formatarAvisoControlados(analise.controlados, paciente.nome));
          await atualizarEstado(paciente.id, {
            dados: {
              ...dadosCompletos,
              tmb_kcal: tmb.tmb_kcal,
              tdee_kcal: tmb.tdee_kcal,
              hidratacao_ml: hidratacao.meta_ml,
              creatina_g: creatina.dose_g,
              metas_kcal: macros.kcal,
              metas_proteina_g: macros.proteina_g,
              metas_carbo_g: macros.carbo_g,
              metas_gordura_g: macros.gordura_g,
              suplementos_controlados: analise.controlados,
            },
          });
          console.warn(
            `[agent] Suplementos controlados detectados em ${paciente.nome}:`,
            analise.controlados.map((c) => c.nome).join(', '),
          );
        }
      } catch (err) {
        console.error('[agent] Falha ao analisar suplementos:', err);
      }

      // Msg 2: explicacao personalizada via Haiku 4.5. Try/catch isolado —
      // se o Haiku falhar, o paciente ja recebeu os numeros e seguimos com as instrucoes.
      try {
        const explicacao = await gerarExplicacaoPersonalizada(
          {
            nome: paciente.nome,
            objetivo: dadosCompletos.objetivo,
            restricoes: dadosCompletos.restricoes ?? [],
          },
          tmb,
          macros,
          hidratacao.meta_ml,
        );
        if (explicacao.trim().length > 0) {
          await sendText(phone, explicacao);
        }
      } catch (err) {
        console.error('[agent] Falha ao gerar explicacao personalizada (Haiku):', err);
      }

      // Instrucoes de uso
      await sendText(
        phone,
        `💡 *Como usar o NutriChat:*\n\n` +
        `• _"comi 200g de frango com arroz"_ — registro por texto\n` +
        `• 🎤 Audio descrevendo sua refeicao\n` +
        `• 📸 Foto do prato ou codigo de barras\n` +
        `• _"qual e minha dieta?"_ — consulta ao PDF\n\n` +
        `Vamos la! 🚀`,
      );

      // Nudge de ativação: um exemplo concreto pra reduzir tempo até o primeiro
      // registro. Sem essa, é comum o paciente ficar sem saber o que digitar
      // e cair em consulta ao PDF ("qual minha dieta?") no primeiro contato,
      // atrasando a formação de hábito.
      await sendText(
        phone,
        `👇 Bora testar agora?\n` +
        `Manda algo simples, tipo: _"tomei 1 copo de café com leite e um pão com manteiga"_`,
      );
    } else {
      // P1-6: quando avancamos para a etapa 14 e a dieta ja tem horarios
      // extraidos do PDF, mandamos confirmacao em vez da pergunta aberta.
      if (proximaEtapa === 14) {
        const prep = await prepararPerguntaEtapa14(paciente.id);
        await atualizarEstado(paciente.id, {
          etapa: proximaEtapa,
          dados: { ...novoDado, ...prep.dadosExtras } as Partial<EstadoEntrevista['dados']>,
        });
        await sendText(phone, prep.mensagem);
      } else {
        await atualizarEstado(paciente.id, { etapa: proximaEtapa, dados: novoDado });
        await sendText(phone, PERGUNTAS_ENTREVISTA[proximaEtapa]);
      }
    }
    return;
  }

  // 5. Entrevista completa — modo agente: registro de refeição OU consulta sobre dieta

  // Limpar estado aguardando_foto_2 expirado (Pitfall 4 — evita tratar texto como 2ª foto)
  const dadosEstado = estado.dados as Record<string, unknown>;
  const aguardando = dadosEstado['aguardando_foto_2'] as { timestamp?: string } | undefined;
  if (aguardando?.timestamp) {
    const diffMs = Date.now() - new Date(aguardando.timestamp).getTime();
    if (diffMs > 5 * 60 * 1000) {
      await atualizarEstado(paciente.id, { dados: { aguardando_foto_2: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
      console.log(`[agent] Estado aguardando_foto_2 expirado — limpo.`);
    }
  }

  // Verificar ambiguidade de foto pendente (Fase C)
  // DEVE vir ANTES de confirmacao_pendente — mesmo padrao D-06 com pergunta previa.
  // Se ativo e nao expirado, essa resposta eh consumida aqui e nao cai no fluxo normal.
  const fotoAmbiguaPendente = dadosEstado['foto_ambigua_pendente'] as {
    tipo: 'pessoas' | 'refeicoes';
    analise: visionService.AnalisePrato;
    timestamp: string;
  } | undefined;

  if (fotoAmbiguaPendente) {
    const expirada = Date.now() - new Date(fotoAmbiguaPendente.timestamp).getTime() > 10 * 60 * 1000;
    if (expirada) {
      // Avisa o paciente antes de limpar — sem isso, resposta >10min depois
      // (ex: "só eu" pra pergunta de pessoas) cai no fluxo normal e vira
      // "não entendi", deixando o paciente confuso sobre o que aconteceu.
      await sendText(phone, '⏰ Sua foto expirou da fila (>10min sem resposta). Manda de novo pra registrar.');
      await atualizarEstado(paciente.id, { dados: { foto_ambigua_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
      // Nao retornar — cai no fluxo normal
    } else {
      const resolvido = await visionService.resolverAmbiguidadeFoto(
        phone,
        paciente,
        { tipo: fotoAmbiguaPendente.tipo, analise: fotoAmbiguaPendente.analise },
        texto,
      );
      if (resolvido) return;
      // Resposta invalida — repete pergunta
      const repergunta = fotoAmbiguaPendente.tipo === 'pessoas'
        ? '🤔 Não entendi. Manda só o número de pessoas (ex: *1*, *2*, *3*).'
        : '🤔 Não entendi. Responde *uma só* ou *separadas*.';
      await sendText(phone, repergunta);
      return;
    }
  }

  // Verificar confirmação pendente de análise de foto (D-06)
  // DEVE vir ANTES do bloco ehRegistro/ehSubstituicao para não conflitar
  const confirmacaoPendente = dadosEstado['confirmacao_pendente'] as {
    analise: visionService.AnalisePrato;
    timestamp: string;
  } | undefined;

  if (confirmacaoPendente) {
    const confirmacaoExpirada = Date.now() - new Date(confirmacaoPendente.timestamp).getTime() > 10 * 60 * 1000;
    if (confirmacaoExpirada) {
      // Mesmo motivo da foto_ambigua_pendente acima: sem aviso, "sim/pode
      // registrar" >10min depois cai como registro novo, confundindo.
      await sendText(phone, '⏰ A confirmação da foto expirou (>10min). Manda a foto de novo pra registrar.');
      await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
      // Não retornar — continuar para processar a mensagem normalmente
    } else {
      const resposta = await visionService.interpretarRespostaConfirmacao(texto);
      if (resposta === 'sim') {
        await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
        const macros = confirmacaoPendente.analise.macros;
        const descricao = confirmacaoPendente.analise.alimentos.join(', ');
        await mealService.registrarRefeicao(paciente.id, descricao, macros, 'foto');
        const estadoAtual = await getEstado(paciente.id);
        const metas = obterMetas(estadoAtual.dados as Record<string, unknown>);
        const saldo = await mealService.obterSaldoDia(paciente.id);
        const streak = await mealService.calcularStreak(paciente.id, metas);
        await sendText(phone, mealService.formatarSaldoDia(descricao, macros.kcal, saldo, metas, streak));
        await mealService.dispararAlertaOvershoot(phone, saldo, metas);
        return;
      } else if (resposta === 'nao') {
        await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
        await sendText(phone, '❌ Registro cancelado. Você pode tirar outra foto ou descrever a refeição por texto.');
        return;
      }
      // Bug D-06 fix Opcao C1 (2026-07-08): resposta 'outro' — paciente
      // digitou correcao parcial ("bife 200g e feijao 100g"). Tenta merge
      // via Haiku: mantem itens nao mencionados + substitui quantidades.
      // Se merge der certo, atualiza estado + re-emite card. Se falhar
      // (Haiku invalido/vazio), cai no fallback Opcao B: cancela card e
      // deixa classificador de intent tratar como refeicao nova.
      const analiseCorrigida = await visionService.aplicarCorrecaoParcial(
        confirmacaoPendente.analise,
        texto,
      );
      if (analiseCorrigida) {
        console.log(`[agent] confirmacao_pendente atualizada via correcao parcial — texto="${texto.slice(0, 60)}"`);
        await visionService.enviarCardConfirmacao(phone, paciente, analiseCorrigida, {
          cabecalho: '✏️ Corrigi a análise:',
        });
        return;
      }
      await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
      console.log(`[agent] confirmacao_pendente cancelada por resposta livre — texto="${texto.slice(0, 60)}"`);
    }
  }

  // P0-2b: paciente respondendo pergunta de preparo ("frita", "cozido",
  // "não sei") — TTL 10 min, gerenciado em meal.ts. Antes do roteamento
  // normal pelo mesmo motivo da refeicao_pendente abaixo.
  const preparoPendente = mealService.obterPreparoPendenteSeValido(dadosEstado);
  if (preparoPendente) {
    await mealService.processarRespostaPreparo(phone, texto, paciente, preparoPendente);
    return;
  }

  // P0-2: paciente respondendo pergunta "quantas gramas de X?" — TTL 10 min,
  // gerenciado em meal.ts. Tem que vir antes do roteamento normal pra resposta
  // curta ("estima", "100g") nao cair no ehRegistro=false e sumir.
  const refeicaoPendente = mealService.obterRefeicaoPendenteSeValida(dadosEstado);
  if (refeicaoPendente) {
    await mealService.processarRespostaQuantidade(phone, texto, paciente, refeicaoPendente);
    return;
  }

  // P1-3: classificador de intencao (fast-path regex + Haiku fallback).
  // Substituiu o empilhamento ehRegistro/ehSubstituicao/ehCorrecao/ehAguaMsg
  // que falhava em "bebi 300ml de suco" (caia em agua) e "comi bem hoje, qual
  // minha dieta?" (caia em registro). O fast-path resolve casos obvios sem
  // latencia; o Haiku trata o resto; fallback seguro = 'consulta'.
  const { intent, fonte } = await classificarIntencao(texto);
  console.log(`[agent] intent=${intent} fonte=${fonte} texto="${texto.slice(0, 80)}"`);

  // Agua combinada com refeicao ("comi pao com 500ml de agua"): incrementa
  // contador silenciosamente antes do card. Cobre o caso em que a intencao
  // primaria e 'registrar' (comida) mas o paciente tambem mencionou agua.
  // P1-3.1: stripa a mencao de agua do texto que vai pro processarTextoRefeicao
  // pra evitar double-count (agua listada como item alem do contador).
  let textoParaRefeicao = texto;
  if (intent === 'registrar' && mencionaAguaCombinada(texto)) {
    const aguaMl = extrairAguaMl(texto);
    if (aguaMl > 0 && aguaMl <= 5000) {
      await registrarAguaContador(paciente.id, aguaMl);
    }
    textoParaRefeicao = removerMencaoAgua(texto);
  }

  if (intent === 'agua') {
    const aguaMl = extrairAguaMl(texto);
    if (aguaMl > 0 && aguaMl <= 5000) {
      const resposta = await registrarAgua(paciente.id, aguaMl);
      await sendText(phone, resposta);
      return;
    }
    // Sem volume valido — segue pro RAG/consulta como fallback ("bebi pouca agua")
  }

  // P0-1: correcao da ultima refeicao — substitui (UPDATE + delta), nao soma.
  if (intent === 'corrigir') {
    const ultima = mealService.obterUltimaRefeicaoSeRecente(dadosEstado);
    if (ultima) {
      await mealService.processarTextoCorrecao(phone, texto, paciente, ultima);
      return;
    }
    // Sem ultima refeicao recente: cai em registro novo (processarTextoRefeicao
    // ignora silenciosamente se o texto nao tem comida).
    await mealService.processarTextoRefeicao(phone, texto, paciente);
    return;
  }

  if (intent === 'registrar' || intent === 'substituicao') {
    // Passa a intencao adiante: o classificador ja decidiu, os regexes
    // internos de processarTextoRefeicao nao devem re-decidir (e derrubar
    // mensagem valida em silencio).
    await mealService.processarTextoRefeicao(phone, textoParaRefeicao, paciente, intent);
    return;
  }

  // Bug UAT 2026-06-24: pergunta de saldo do dia caia em 'consulta' → RAG →
  // Claude alucinava kcal sem ter acesso a registros_diarios. Handler dedicado
  // busca o saldo autoritativo + metas e responde com o bloco de progresso.
  if (intent === 'saldo') {
    const metas = obterMetas(dadosEstado);
    const saldo = await mealService.obterSaldoDia(paciente.id);
    const streak = await mealService.calcularStreak(paciente.id, metas);
    await sendText(phone, mealService.formatarBlocoProgressoDia(saldo, metas, streak));
    return;
  }

  // intent === 'consulta' (ou 'agua' sem volume valido) — responder via RAG
  const contextoRag = await ragQuery(paciente.id, texto);
  const perfil: PerfilNutricional = {
    objetivo: dadosEstado['objetivo'] as ObjetivoNutricional | undefined,
    restricoes: (dadosEstado['restricoes'] as string[] | undefined) ?? [],
    preferencias_recusas: (dadosEstado['preferencias_recusas'] as string[] | undefined) ?? [],
  };

  // P2-9: memoria multi-turn. So aplica em 'consulta' — outras intencoes
  // (refeicao/agua/correcao) sao acoes estruturadas, nao precisam de historico.
  let historico: ConversaMensagem[] = [];
  try {
    historico = await obterUltimasMensagens(paciente.id, 12);
  } catch (e) {
    console.error('[agent] Erro ao obter historico (seguindo sem memoria):', e);
  }

  const resposta = await responderComClaude(texto, contextoRag, paciente.nome, perfil, historico);
  await sendText(phone, resposta);

  // Registra DEPOIS do envio: erro aqui nao deve afetar o paciente.
  try {
    await registrarMensagem(paciente.id, 'user', texto);
    await registrarMensagem(paciente.id, 'assistant', resposta);
  } catch (e) {
    console.error('[agent] Erro ao registrar conversa no historico:', e);
  }
}

export async function enviarBoasVindas(pacienteId: string): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('pacientes')
    .select('nome, whatsapp')
    .eq('id', pacienteId)
    .single();

  if (error || !data) {
    console.error(`[agent] Paciente ${pacienteId} nao encontrado para boas-vindas`);
    return;
  }

  await atualizarEstado(pacienteId, { status: 'em_andamento', etapa: 1 });
  await sendText(
    data.whatsapp as string,
    `Ola, ${data.nome}! 👋 Sou o *NutriChat*, seu assistente nutricional pelo WhatsApp.\n\n` +
    `Fui cadastrado pelo seu nutricionista para te ajudar com sua dieta. 🥗\n\n` +
    PERGUNTAS_ENTREVISTA[1],
  );
}
