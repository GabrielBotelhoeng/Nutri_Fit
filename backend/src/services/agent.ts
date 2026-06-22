import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { sendText } from './evolution';
import { query as ragQuery } from './rag';
import {
  buscarPacientePorWhatsapp,
  getEstado,
  atualizarEstado,
  EstadoEntrevista,
  ObjetivoNutricional,
} from './conversation';
import * as mealService from './meal';
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

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

// D-03: Acumular agua via RPC
async function registrarAgua(pacienteId: string, aguaMl: number): Promise<string> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const hoje = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.rpc('registrar_agua_diaria', {
    p_paciente_id: pacienteId,
    p_data: hoje,
    p_agua_ml: aguaMl,
  });
  if (error) {
    console.error('[agent] Erro ao registrar agua:', error.message);
    return `⚠️ Erro ao registrar hidratação. Tente novamente.`;
  }
  return `💧 *${aguaMl}ml* de água registrados! Continue se hidratando. 💚`;
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
    messages: [{ role: 'user', content: perguntaUsuario }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
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
  const hoje = new Date().toISOString().slice(0, 10);
  const expirouPorData = !!paciente.data_expiracao && (paciente.data_expiracao as string) < hoje;

  if (!paciente.ativo || expirouPorData) {
    await sendText(phone, '⏰ Seu plano NutriChat expirou. Entre em contato com seu nutricionista para renovar e voltar a receber acompanhamento. 💚');
    return;
  }

  // AGENT-18: aviso reativo quando plano vence em <= 3 dias
  if (paciente.data_expiracao) {
    const dataExp = new Date(paciente.data_expiracao as string);
    const diasParaVencer = Math.ceil((dataExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diasParaVencer > 0 && diasParaVencer <= 3) {
      const diasStr = diasParaVencer === 1 ? '1 dia' : `${diasParaVencer} dias`;
      await sendText(phone, `⚠️ Lembrete: seu plano NutriChat vence em *${diasStr}*. Renove com seu nutricionista para nao perder o acompanhamento. 💚`);
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
    const novoDado = await processarRespostaEntrevista(paciente.id, etapa, texto, estado.dados);

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
    } else {
      await atualizarEstado(paciente.id, { etapa: proximaEtapa, dados: novoDado });
      await sendText(phone, PERGUNTAS_ENTREVISTA[proximaEtapa]);
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

  // Verificar confirmação pendente de análise de foto (D-06)
  // DEVE vir ANTES do bloco ehRegistro/ehSubstituicao para não conflitar
  const confirmacaoPendente = dadosEstado['confirmacao_pendente'] as {
    analise: {
      alimentos: string[];
      macros: { kcal: number; proteina_g: number; carbo_g: number; gordura_g: number };
      confianca: string;
      aviso: string | null;
    };
    timestamp: string;
  } | undefined;

  if (confirmacaoPendente) {
    const confirmacaoExpirada = Date.now() - new Date(confirmacaoPendente.timestamp).getTime() > 10 * 60 * 1000;
    if (confirmacaoExpirada) {
      await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
      // Não retornar — continuar para processar a mensagem normalmente
    } else {
      const textoConfirmacao = texto.toLowerCase().trim();
      if (textoConfirmacao === 'sim' || textoConfirmacao === 's' || textoConfirmacao === 'yes') {
        await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
        const macros = confirmacaoPendente.analise.macros;
        const descricao = confirmacaoPendente.analise.alimentos.join(', ');
        await mealService.registrarRefeicao(paciente.id, descricao, macros, 'foto');
        const estadoAtual = await getEstado(paciente.id);
        const metas = obterMetas(estadoAtual.dados as Record<string, unknown>);
        const saldo = await mealService.obterSaldoDia(paciente.id);
        await sendText(phone, mealService.formatarSaldoDia(descricao, macros.kcal, saldo, metas));
        await mealService.dispararAlertaOvershoot(phone, saldo, metas);
        return;
      } else if (textoConfirmacao === 'não' || textoConfirmacao === 'nao' || textoConfirmacao === 'n' || textoConfirmacao === 'no') {
        await atualizarEstado(paciente.id, { dados: { confirmacao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'] });
        await sendText(phone, '❌ Registro cancelado. Você pode tirar outra foto ou descrever a refeição por texto.');
        return;
      }
      // Não é sim/não — ignorar confirmação pendente e processar normalmente
    }
  }

  // Detectar intenção antes de despachar
  const textoLower = texto.toLowerCase();
  const ehSubstituicao = /substitu|nao tenho|não tenho|alternativa|trocar/.test(textoLower);
  // Verbos no passado + medidas indicam registro. Substantivos puros (cafe, lanche,
  // refeicao, prato) caem em perguntas tipo "o que comer no cafe?" — nao sao gatilho.
  const ehRegistro = /\bcomi\b|\btomei\b|\bbebi\b|\balmocei\b|\bjantei\b|\bg de\b|\bml de\b|\bcolher|\bgramas\b/.test(textoLower);

  // D-03: Detectar registro de agua — verificar ANTES de ehRegistro para extrair
  const AGUA_RE = /(\d+)\s*(ml|litros?|copos?)|bebi\s+\d+\s*(ml|litros?|copos?)/i;
  const ehAguaMsg = AGUA_RE.test(textoLower) && /agua|bebi|hidrat|bebo/i.test(textoLower);

  if (ehAguaMsg) {
    const matchMl = texto.match(/(\d+)\s*ml/i);
    const matchLitro = texto.match(/(\d+)\s*litros?/i);
    const matchCopo = texto.match(/(\d+)\s*copos?/i);
    let aguaMl = 0;
    if (matchMl) aguaMl = parseInt(matchMl[1], 10);
    else if (matchLitro) aguaMl = parseInt(matchLitro[1], 10) * 1000;
    else if (matchCopo) aguaMl = parseInt(matchCopo[1], 10) * 250;

    if (aguaMl > 0 && aguaMl <= 5000) {
      const resposta = await registrarAgua(paciente.id, aguaMl);
      await sendText(phone, resposta);
      return;
    }
  }

  if (ehRegistro || ehSubstituicao) {
    await mealService.processarTextoRefeicao(phone, texto, paciente);
  } else {
    // Consulta sobre dieta — responder via RAG
    const contextoRag = await ragQuery(paciente.id, texto);
    const perfil: PerfilNutricional = {
      objetivo: dadosEstado['objetivo'] as ObjetivoNutricional | undefined,
      restricoes: (dadosEstado['restricoes'] as string[] | undefined) ?? [],
      preferencias_recusas: (dadosEstado['preferencias_recusas'] as string[] | undefined) ?? [],
    };
    const resposta = await responderComClaude(texto, contextoRag, paciente.nome, perfil);
    await sendText(phone, resposta);
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
