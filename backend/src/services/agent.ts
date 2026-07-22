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
import {
  analisarSuplementos,
  calcularDoseSuplementos,
  CONTROLADOS,
  detectarPerguntaDoseControlada,
  formatarAvisoControlados,
  formatarExplicacaoTermogenicos,
  formatarMensagemSuplementos,
  formatarRespostaDoseControlada,
} from './suplementos';
import {
  formatarMensagemSuplementosLLM,
  sugerirDoseSuplementosLLM,
} from './suplementos-llm';
import {
  registrarMensagem,
  obterUltimasMensagens,
  ConversaMensagem,
} from './conversaHistorico';
import { hojeLocal } from '../utils/datas';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

// Registra água sem enviar mensagem — usado quando a água vem junto com uma refeição.
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

// Converte token de quantidade em numero:
// "1.5"/"1,5" (decimal), "1 e meio"/"1 e meia" (composto), "meio"/"meia" (0.5),
// "um"/"uma" (1), "dois"/"duas" (2), "tres"/"três" (3).
// Retorna null se nao conseguir parsear.
function parseQuantidade(token: string): number | null {
  const t = token.toLowerCase().trim();
  if (t === 'meio' || t === 'meia') return 0.5;
  if (t === 'um' || t === 'uma') return 1;
  if (t === 'dois' || t === 'duas') return 2;
  if (t === 'tres' || t === 'três') return 3;
  const compostoMatch = t.match(/^(\d+)\s+e\s+me[ia]o?$/);
  if (compostoMatch) return parseInt(compostoMatch[1], 10) + 0.5;
  const num = parseFloat(t.replace(',', '.'));
  if (!isNaN(num) && num > 0) return num;
  return null;
}

// Padrao de quantidade: mesma regex usada em AGUA_VOLUME_RE do intent.ts.
const QTY_PATTERN = String.raw`\d+(?:[.,]\d+)?(?:\s+e\s+me[ia]o?)?|meio|meia|um[ao]?|dois|duas|tr[êe]s`;

// Copo = 250ml, garrafa = 500ml, litro = 1000ml.
// Aceita "1 e meio litros", "meia garrafa", "1,5 copos" etc. Retorna 0 quando nao acha volume.
function extrairAguaMl(texto: string): number {
  const t = texto.toLowerCase();

  // Ordem importa: "ml" precisa vir antes de "litros" pra evitar "500 mililitros" bater errado.
  const padroes: Array<{ re: RegExp; multiplicador: number }> = [
    { re: new RegExp(`(${QTY_PATTERN})\\s*ml\\b`, 'i'),         multiplicador: 1 },
    { re: new RegExp(`(${QTY_PATTERN})\\s*litros?\\b`, 'i'),    multiplicador: 1000 },
    { re: new RegExp(`(${QTY_PATTERN})\\s*copos?\\b`, 'i'),     multiplicador: 250 },
    { re: new RegExp(`(${QTY_PATTERN})\\s*copin\\w+\\b`, 'i'),  multiplicador: 250 },
    { re: new RegExp(`(${QTY_PATTERN})\\s*garrafas?\\b`, 'i'),  multiplicador: 500 },
  ];

  for (const { re, multiplicador } of padroes) {
    const match = t.match(re);
    if (match) {
      const qty = parseQuantidade(match[1]);
      if (qty !== null) return Math.round(qty * multiplicador);
    }
  }

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
     '_Responda com o numero (1, 2, 3 ou 4)._',
  3: '👤 *Qual e o seu sexo?*\n\n' +
     '1️⃣ Masculino\n' +
     '2️⃣ Feminino\n\n' +
     '_Responda com o numero (1 ou 2)._',
  4: '⚖️ *Qual e o seu peso atual em kg?*\n\n_Escreva o valor (ex: 75 ou 70,5)._',
  5: '📏 *Qual e a sua altura?*\n\n_Escreva o valor em cm (ex: 175) ou em metros (ex: 1,75)._',
  6: '🏃 *Que tipo de atividade fisica voce pratica?*\n\n' +
     '1️⃣ Musculação\n' +
     '2️⃣ Corrida\n' +
     '3️⃣ Caminhada\n' +
     '4️⃣ Sedentário (não pratico)\n\n' +
     '_Responda com o numero ou escreva outra atividade (ex: "natação")._',
  7: '📅 *Com que frequencia voce treina?*\n\n' +
     '1️⃣ Não treino\n' +
     '2️⃣ 1-2x por semana\n' +
     '3️⃣ 3-4x por semana\n' +
     '4️⃣ 5+ por semana\n\n' +
     '_Responda com o numero._',
  8: '⏰ *Em que horario voce costuma treinar?*\n\n_Escreva o horario (ex: 18h, "de manha" ou "nao treino")._',
  9: '🌙 *Que horas voce costuma acordar e dormir?*\n\n_Escreva os dois horarios (ex: 6h e 23h)._',
  10: '⚠️ *Voce tem alergias, intolerancias ou condicoes de saude?* (ex: lactose, gluten, diabetes, hipertensao).\n\nSe nao tiver, responda "nenhuma".',
  11: '🚫 *Tem algum alimento que voce NAO come ou tem aversao?* (ex: peixe, quiabo, frutos do mar).\n\nSe nao tiver, responda "nenhuma".',
  12: '📖 *Voce ja fez dieta antes?* Conte rapidamente o que funcionou ou nao funcionou pra voce. Se for a primeira vez, responda "nunca".',
  13: '💊 *Voce usa algum suplemento hoje?* Se sim, quais (separados por virgula). Se nao, responda "nao uso".',
  14: '🍽️ *Em quais horarios voce costuma fazer suas refeicoes?*\n\n' +
      'Voce pode mandar 3 (cafe, almoco, jantar) ou 5 (incluindo lanches da manha/tarde).\n\n' +
      'Ex: "cafe 7h, almoco 12h30, jantar 20h"\n' +
      'Ou: "7h, 10h, 12h30, 16h, 20h"',
};

const NEGATIVA_LISTA_RE = /^(nao|não)(\s+(tenho|uso|come|como))?$|^(nenhum[ao]?|nenhuns)$/;

function parseListaOuVazio(texto: string): string[] {
  const t = texto.toLowerCase().trim();
  if (NEGATIVA_LISTA_RE.test(t)) return [];
  return texto.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function parseObjetivo(texto: string): ObjetivoNutricional | null {
  const t = texto.toLowerCase().trim();
  if (t === '1') return 'emagrecer';
  if (t === '2') return 'ganhar_massa';
  if (t === '3') return 'manter';
  if (t === '4') return 'saude_geral';
  // Ordem importa: "ganhar peso" não deve cair em emagrecer pelo token "peso".
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

// Aceita cm (100-250) ou metros (1.0-2.5); normaliza para cm inteiro.
function parseAltura(texto: string): number | null {
  const limpo = texto.toLowerCase().replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(limpo);
  if (isNaN(num)) return null;
  if (num >= 1 && num < 3) return Math.round(num * 100);
  if (num >= 100 && num <= 250) return Math.round(num);
  return null;
}

// Fallback: salva texto cru pra não prender o usuário.
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

function formatarHoraValida(h: number, m: number): string | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Aceita "7h", "7:00", "7h00", "19h30", "12:30".
function parseHorariosRefeicoes(texto: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  const t = texto.toLowerCase();
  const horaRe = /(\d{1,2})[:hH](?:(\d{2}))?/g;

  const keywords: Array<[string, RegExp]> = [
    // Ordem importa: "lanche_manha"/"lanche_tarde" precisam casar antes do "lanche" genérico.
    ['lanche_manha', /(lanche[^,;.]{0,15}(manh|manh[ãa])|colac[aã]o|colacao)/],
    ['lanche_tarde', /(lanche[^,;.]{0,15}tarde|merenda|tarde[^,;.]{0,15}lanche)/],
    ['cafe', /(caf[eé](?:\s+da\s+manh[ãa])?|manh[ãa]\b)/],
    ['almoco', /(almo[çc]?o)/],
    ['jantar', /(jantar|janta\b|ceia|noite\b)/],
  ];

  const ocupados = new Set<number>();
  for (const [key, kwRe] of keywords) {
    const kwMatch = t.match(kwRe);
    if (!kwMatch) continue;
    const idx = kwMatch.index ?? 0;
    if ([...Array(kwMatch[0].length).keys()].some((i) => ocupados.has(idx + i))) continue;
    const janela = t.slice(idx, Math.min(t.length, idx + kwMatch[0].length + 25));
    const horaMatch = janela.match(/(\d{1,2})[:hH](?:(\d{2}))?/);
    if (!horaMatch) continue;
    const h = parseInt(horaMatch[1], 10);
    const m = horaMatch[2] ? parseInt(horaMatch[2], 10) : 0;
    const hora = formatarHoraValida(h, m);
    if (!hora) continue;
    resultado[key] = hora;
    const horaIdx = (horaMatch.index ?? 0) + idx;
    for (let i = idx; i < idx + kwMatch[0].length; i++) ocupados.add(i);
    for (let i = horaIdx; i < horaIdx + horaMatch[0].length; i++) ocupados.add(i);
  }

  if (Object.keys(resultado).length > 0) return resultado;

  // Fallback por ordem: 3 horários → café/almoço/jantar; 5+ → café/lanche_manha/almoço/lanche_tarde/jantar.
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

// Usado no fluxo "parcial" da etapa 14, quando o paciente responde só os horários faltantes.
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

// ─── Helpers da etapa 14 quando o PDF da dieta já traz horários ───

type RefeicaoKey = 'cafe' | 'lanche_manha' | 'almoco' | 'lanche_tarde' | 'jantar';

const LABEL_REFEICAO: Record<RefeicaoKey, string> = {
  cafe: '☕ Cafe',
  lanche_manha: '🥪 Lanche da manha',
  almoco: '🍽️ Almoco',
  lanche_tarde: '🍎 Lanche da tarde',
  jantar: '🌙 Jantar',
};

// "07:00" → "7h"; "07:30" → "7h30"; "12:30" → "12h30".
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
  novoDado?: Partial<EstadoEntrevista['dados']>;
  mensagemRepetir?: string;
}

// handled=false devolve o fluxo pro parser tradicional (pergunta aberta).
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
          confirmacao_horarios_pendente: null,
          horarios_pre_extraidos: null,
        } as Partial<EstadoEntrevista['dados']>,
      };
    }
    if (NAO_RE.test(t)) {
      return {
        handled: true,
        mensagemRepetir: PERGUNTAS_ENTREVISTA[14],
        novoDado: {
          confirmacao_horarios_pendente: null,
          horarios_pre_extraidos: null,
        } as Partial<EstadoEntrevista['dados']>,
      };
    }
    return {
      handled: true,
      mensagemRepetir: '❓ Responda *sim* se os horarios conferem ou *nao* para informar diferentes.',
    };
  }

  if (flag === 'parcial') {
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
      // Aceita número (1/2) ou texto livre (masc/fem/m/f).
      if (textoLower === '1' || textoLower.includes('masc') || textoLower === 'm') novoDado.sexo = 'masculino';
      else if (textoLower === '2' || textoLower.includes('fem') || textoLower === 'f') novoDado.sexo = 'feminino';
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
      // 1-4 mapeiam nas opções canônicas; qualquer outro texto (ex: "natação") passa cru.
      const mapaAtiv: Record<string, string> = {
        '1': 'musculação', '2': 'corrida', '3': 'caminhada', '4': 'sedentário',
      };
      novoDado.atividade_tipo = mapaAtiv[textoLower] ?? texto.trim();
      break;
    }
    case 7: {
      // 1-4 mapeiam na faixa; qualquer outro texto (ex: "todo dia") passa cru.
      const mapaFreq: Record<string, string> = {
        '1': 'não treino',
        '2': '1-2x por semana',
        '3': '3-4x por semana',
        '4': '5+ por semana',
      };
      novoDado.atividade_frequencia = mapaFreq[textoLower] ?? texto.trim();
      break;
    }
    case 8: {
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
      // Mínimo 2 horários — abaixo disso provavelmente o formato foi mal entendido.
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

// Retorna null se fora da janela de 3 dias ou já avisado hoje. `agoraMs` injetável só nos testes.
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
  const paciente = await buscarPacientePorWhatsapp(phone);

  if (!paciente) {
    await sendText(phone, '😕 Seu numero nao esta cadastrado. Fale com seu nutricionista.');
    return;
  }

  // Defesa em camadas: bloqueia mesmo se o cron de expiração ainda não rodou.
  const hoje = hojeLocal();
  const expirouPorData = !!paciente.data_expiracao && (paciente.data_expiracao as string) < hoje;

  if (!paciente.ativo || expirouPorData) {
    await sendText(phone, '⏰ Seu plano NutriChat expirou. Entre em contato com seu nutricionista para renovar e voltar a receber acompanhamento. 💚');
    return;
  }

  // No máximo um aviso de vencimento por dia (ultimo_aviso_expiracao vive em entrevista_dados).
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

  const estado = await getEstado(paciente.id);

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

  if (estado.status === 'em_andamento') {
    const etapa = estado.etapa;

    let novoDado: Partial<EstadoEntrevista['dados']> = {};
    let pulouProximaEtapa = false;
    if (etapa === 14) {
      const especial = tratarRespostaConfirmacaoHorarios(texto, estado.dados);
      if (especial.handled) {
        if (especial.mensagemRepetir) {
          if (especial.novoDado) {
            await atualizarEstado(paciente.id, { dados: especial.novoDado });
          }
          await sendText(phone, especial.mensagemRepetir);
          return;
        }
        novoDado = especial.novoDado ?? {};
        pulouProximaEtapa = true;
      }
    }

    if (!pulouProximaEtapa) {
      novoDado = await processarRespostaEntrevista(paciente.id, etapa, texto, estado.dados);
    }

    if (Object.keys(novoDado).length === 0) {
      await sendText(phone, `❓ Nao entendi. ${PERGUNTAS_ENTREVISTA[etapa]}`);
      return;
    }

    const proximaEtapa = etapa + 1;

    if (proximaEtapa > TOTAL_ETAPAS) {
      const dadosCompletos = { ...estado.dados, ...novoDado } as DadosEntrevista & {
        objetivo?: ObjetivoNutricional;
        restricoes?: string[];
        horarios_refeicoes?: Record<string, string>;
      };

      const tmb = calcularTMB(dadosCompletos);
      const hidratacao = calcularHidratacao(dadosCompletos.peso_kg);
      const creatina = calcularCreatina(dadosCompletos.peso_kg, dadosCompletos.suplementos);
      const macros = calcularMacros(tmb.tdee_kcal, dadosCompletos.objetivo, dadosCompletos.peso_kg);

      // metas_* viram fonte de verdade para meal.ts/vision.ts/agent.ts via obterMetas.
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

      // Try/catch isolado: falha de sync não pode derrubar a confirmação da entrevista.
      try {
        await sincronizarAlertasDaEntrevista(paciente.id, dadosCompletos.horarios_refeicoes);
      } catch (err) {
        console.error('[agent] Falha ao sincronizar alertas_config:', err);
      }

      await sendText(
        phone,
        `✅ Perfeito, ${paciente.nome}! Entrevista concluida.\n\n` +
        `Calculando seus numeros personalizados... ⏳`,
      );

      await new Promise((resolve) => setTimeout(resolve, 1500));

      await sendText(phone, formatarMensagemCalculos(tmb, macros, hidratacao, creatina));

      // Guard-rails triplos p/ controlados: (1) analisarSuplementos filtra; (2) LLM instruído
      // a não dosear substâncias controladas; (3) filtro pós-LLM cross-checka com CONTROLADOS.
      try {
        const analise = analisarSuplementos(dadosCompletos.suplementos);

        if (analise.seguros.length > 0 || analise.desconhecidos.length > 0) {
          const controladosSet = new Set(Object.keys(CONTROLADOS));
          const resultadoLLM = await sugerirDoseSuplementosLLM(
            {
              peso_kg: dadosCompletos.peso_kg,
              sexo: dadosCompletos.sexo ?? '',
              objetivo: dadosCompletos.objetivo ?? '',
            },
            analise.seguros,
            analise.desconhecidos,
            controladosSet,
          );

          if (!resultadoLLM.falhou && resultadoLLM.blocos.length > 0) {
            const msgDoses = formatarMensagemSuplementosLLM(resultadoLLM.blocos);
            if (msgDoses) await sendText(phone, msgDoses);
          } else if (analise.seguros.length > 0) {
            // Fallback quando o LLM falha (429/timeout/JSON inválido).
            const { comCalculo, outrosInformados } = calcularDoseSuplementos(
              dadosCompletos.peso_kg,
              analise.seguros,
            );
            const msgDoses = formatarMensagemSuplementos(comCalculo, outrosInformados);
            if (msgDoses) await sendText(phone, msgDoses);
          }

          if (analise.seguros.length > 0) {
            const { comCalculo } = calcularDoseSuplementos(dadosCompletos.peso_kg, analise.seguros);
            const msgTermo = formatarExplicacaoTermogenicos(comCalculo);
            if (msgTermo) await sendText(phone, msgTermo);
          }
        }

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

      // Try/catch isolado — se o Haiku falhar, o paciente já recebeu os números.
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

      await sendText(
        phone,
        `💡 *Como usar o NutriChat:*\n\n` +
        `• _"comi 200g de frango com arroz"_ — registro por texto\n` +
        `• 🎤 Audio descrevendo sua refeicao\n` +
        `• 📸 Foto do prato ou codigo de barras\n` +
        `• _"qual e minha dieta?"_ — consulta ao PDF\n\n` +
        `Vamos la! 🚀`,
      );

      // Nudge neutro sem exemplo literal — copiar/colar viraria registro real de refeição.
      await sendText(
        phone,
        `👇 *Tô pronto pra te ajudar!*\n\n` +
        `Você pode:\n` +
        `• Registrar refeições por texto, áudio ou foto\n` +
        `• Perguntar sobre sua dieta a qualquer hora\n\n` +
        `Também vou te lembrar de hidratação e alimentação nos horários que combinamos. 💧🍽️\n\n` +
        `Qualquer coisa, é só me chamar. 💪`,
      );
    } else {
      // Se a dieta já tem horários extraídos do PDF, manda confirmação em vez da pergunta aberta.
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

  // Entrevista completa: modo agente (registro OU consulta).

  // Limpa estado aguardando_foto_2 expirado pra não tratar texto como 2ª foto.
  const dadosEstado = estado.dados as Record<string, unknown>;
  const aguardando = dadosEstado['aguardando_foto_2'] as { timestamp?: string } | undefined;
  if (aguardando?.timestamp) {
    const diffMs = Date.now() - new Date(aguardando.timestamp).getTime();
    if (diffMs > 5 * 60 * 1000) {
      await atualizarEstado(paciente.id, { dados: { aguardando_foto_2: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
      console.log(`[agent] Estado aguardando_foto_2 expirado — limpo.`);
    }
  }

  // DEVE vir antes do bloco confirmacao_pendente — resposta é consumida aqui.
  const fotoAmbiguaPendente = dadosEstado['foto_ambigua_pendente'] as {
    tipo: 'pessoas' | 'refeicoes';
    analise: visionService.AnalisePrato;
    timestamp: string;
  } | undefined;

  if (fotoAmbiguaPendente) {
    const expirada = Date.now() - new Date(fotoAmbiguaPendente.timestamp).getTime() > 10 * 60 * 1000;
    if (expirada) {
      // Avisa o paciente antes de limpar — sem isso, resposta tardia vira "não entendi".
      await sendText(phone, '⏰ Sua foto expirou da fila (>10min sem resposta). Manda de novo pra registrar.');
      await atualizarEstado(paciente.id, { dados: { foto_ambigua_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
    } else {
      const resolvido = await visionService.resolverAmbiguidadeFoto(
        phone,
        paciente,
        { tipo: fotoAmbiguaPendente.tipo, analise: fotoAmbiguaPendente.analise },
        texto,
      );
      if (resolvido) return;
      const repergunta = fotoAmbiguaPendente.tipo === 'pessoas'
        ? '🤔 Não entendi. Manda só o número de pessoas (ex: *1*, *2*, *3*).'
        : '🤔 Não entendi. Responde *uma só* ou *separadas*.';
      await sendText(phone, repergunta);
      return;
    }
  }

  // DEVE vir antes de ehRegistro/ehSubstituicao pra não conflitar.
  const confirmacaoPendente = dadosEstado['confirmacao_pendente'] as {
    analise: visionService.AnalisePrato;
    timestamp: string;
  } | undefined;

  if (confirmacaoPendente) {
    const confirmacaoExpirada = Date.now() - new Date(confirmacaoPendente.timestamp).getTime() > 10 * 60 * 1000;
    if (confirmacaoExpirada) {
      // Sem aviso, "sim" >10min depois cairia como registro novo.
      await sendText(phone, '⏰ A confirmação da foto expirou (>10min). Manda a foto de novo pra registrar.');
      await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
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
      // Resposta 'outro': tenta merge de correção parcial via Haiku (mantém itens não
      // mencionados + substitui quantidades). Se o merge falhar, cancela e deixa o
      // classificador tratar como refeição nova.
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

  // Resposta a pergunta de preparo ("frita", "cozido", "não sei"). TTL 10 min gerenciado em meal.ts.
  const preparoPendente = mealService.obterPreparoPendenteSeValido(dadosEstado);
  if (preparoPendente) {
    await mealService.processarRespostaPreparo(phone, texto, paciente, preparoPendente);
    return;
  }

  // Resposta a pergunta "quantas gramas de X?". Precede o roteamento normal pra respostas
  // curtas ("estima", "100g") não caírem em ehRegistro=false.
  const refeicaoPendente = mealService.obterRefeicaoPendenteSeValida(dadosEstado);
  if (refeicaoPendente) {
    await mealService.processarRespostaQuantidade(phone, texto, paciente, refeicaoPendente);
    return;
  }

  // Guarda de segurança: pergunta sobre dose/ciclo de controlada dispara redirect médico
  // ANTES de qualquer intent handler. Nunca passa dose.
  const substanciaControlada = detectarPerguntaDoseControlada(texto);
  if (substanciaControlada) {
    console.warn(
      `[agent] Paciente ${paciente.nome} perguntou sobre dose de controlada: ${substanciaControlada}`,
    );
    await sendText(phone, formatarRespostaDoseControlada(paciente.nome, substanciaControlada));
    return;
  }

  const { intent, fonte } = await classificarIntencao(texto);
  console.log(`[agent] intent=${intent} fonte=${fonte} texto="${texto.slice(0, 80)}"`);

  // Água combinada com refeição ("comi pao com 500ml de agua"): incrementa contador
  // silenciosamente e stripa a menção do texto pra evitar double-count no card.
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
    // Intent é água mas parser não achou volume válido ("bebi 1 e meio de águas",
    // "bebi bastante"). Sem clarificação, o RAG só devolve texto motivacional e o
    // contador não incrementa — daí o total fica congelado sem o paciente saber.
    await sendText(
      phone,
      `💧 Quanto foi? Me manda um destes formatos:\n\n` +
      `• *500ml* (ou qualquer número + ml)\n` +
      `• *1 copo* (250ml) — pode ser "2 copos", "meio copo"\n` +
      `• *1 garrafa* (500ml) — pode ser "meia garrafa"\n` +
      `• *1 litro* — pode ser "1,5 litros" ou "1 e meio"`,
    );
    return;
  }

  // Correção da última refeição: substitui (UPDATE + delta), não soma.
  if (intent === 'corrigir') {
    const ultima = mealService.obterUltimaRefeicaoSeRecente(dadosEstado);
    if (ultima) {
      await mealService.processarTextoCorrecao(phone, texto, paciente, ultima);
      return;
    }
    await mealService.processarTextoRefeicao(phone, texto, paciente);
    return;
  }

  if (intent === 'registrar' || intent === 'substituicao') {
    // Passa a intent adiante — o classificador já decidiu, regexes internos não devem re-decidir.
    await mealService.processarTextoRefeicao(phone, textoParaRefeicao, paciente, intent);
    return;
  }

  // Handler dedicado pra saldo: sem isso, o RAG alucina kcal por não ter acesso a registros_diarios.
  if (intent === 'saldo') {
    const metas = obterMetas(dadosEstado);
    const saldo = await mealService.obterSaldoDia(paciente.id);
    const streak = await mealService.calcularStreak(paciente.id, metas);
    await sendText(phone, mealService.formatarBlocoProgressoDia(saldo, metas, streak));
    return;
  }

  // intent === 'consulta' (ou 'agua' sem volume válido): responde via RAG.
  const contextoRag = await ragQuery(paciente.id, texto);
  const perfil: PerfilNutricional = {
    objetivo: dadosEstado['objetivo'] as ObjetivoNutricional | undefined,
    restricoes: (dadosEstado['restricoes'] as string[] | undefined) ?? [],
    preferencias_recusas: (dadosEstado['preferencias_recusas'] as string[] | undefined) ?? [],
  };

  // Memória multi-turn só em consultas — outras intents são ações estruturadas.
  let historico: ConversaMensagem[] = [];
  try {
    historico = await obterUltimasMensagens(paciente.id, 12);
  } catch (e) {
    console.error('[agent] Erro ao obter historico (seguindo sem memoria):', e);
  }

  const resposta = await responderComClaude(texto, contextoRag, paciente.nome, perfil, historico);
  await sendText(phone, resposta);

  // Registra DEPOIS do envio: erro aqui não deve afetar o paciente.
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
