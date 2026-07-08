import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { downloadMedia } from './audio';
import { sendText } from './evolution';
import { buscarPacientePorWhatsapp, getEstado, atualizarEstado } from './conversation';
import type { PacienteInfo } from './conversation';
import { processarCodigoBarras } from './barcode';
import { registrarRefeicao, obterSaldoDia, formatarSaldoDia, formatarBlocoProgressoDia, dispararAlertaOvershoot, calcularStreak, MacrosRefeicao } from './meal';
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
        { type: 'text', text: `Analise esta imagem e responda APENAS com uma das três opções:\n- "prato" — se for uma foto de comida, prato ou refeição\n- "barcode" — se for uma foto de código de barras (código de barras EAN/QR)\n- "rotulo" — se for uma foto de tabela nutricional ou rótulo de embalagem de alimento\n\nResponda com APENAS uma palavra. Não explique.` },
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

async function analisarPrato(base64s: string[], mimetype: string): Promise<AnalisePrato> {
  const mimeClean = mimetype.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  const imageBlocks = base64s.map((b64) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: mimeClean, data: b64 },
  }));

  const promptAviso = base64s.length === 2
    ? '\n\nO paciente enviou 2 ângulos do prato — use ambas as fotos para melhor estimativa de porção.'
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

Ambiguidade:
- "nenhuma": 1 prato com vários alimentos (arroz+feijão+frango), ou 1 prato + 1 sobremesa/bebida acompanhando (é 1 refeição completa), ou apenas 1 recipiente/bebida.
- "multiplos_pratos_parecidos": 2+ pratos VISUALMENTE PARECIDOS (mesmo tipo de comida, mesma louça) — provável mesa da família, não o paciente comendo 2×. Também vale pra 2+ bebidas iguais em série (2 latas iguais, 2 copos idênticos).
- "refeicoes_distintas": 2+ pratos CLARAMENTE DIFERENTES a ponto de parecerem refeições distintas (ex: prato com arroz+carne + prato com panqueca+ovo = almoço + café; ou 1 marmita + 1 lanche).

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

// Envia lista de alimentos identificados ao paciente e aguarda confirmação "sim"/"não" (D-06).
// A interceptação da resposta é feita em agent.ts no bloco confirmacao_pendente.
async function handleConfirmacaoPrato(
  phone: string,
  paciente: PacienteInfo,
  analise: AnalisePrato,
  metas: MacrosDiarios,
  avisoExtra?: string,
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

  const lista = analise.alimentos.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const avisoConfianca = analise.confianca === 'baixa' ? '\n⚠️ Baixa confiança na identificação.' : '';
  const avisoLimitacao = avisoExtra ? `\n${avisoExtra}` : '';

  await sendText(
    phone,
    `📸 Identifiquei na foto:\n${lista}\n\nEst. ${Math.round(analise.macros.kcal)} kcal${avisoConfianca}${avisoLimitacao}\n\nEstá correto? Responda *sim* para registrar ou *não* para cancelar.`,
  );
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

    if (tipo === 'barcode') {
      const produto = await processarCodigoBarras(base64, mimetype);
      if (produto) {
        const descricao = `${produto.nome} (~100g)`;
        await registrarRefeicao(paciente.id, descricao, produto.macrosPor100g, 'codigo_barras');
        const saldo = await obterSaldoDia(paciente.id);
        const streak = await calcularStreak(paciente.id, metas);
        await sendText(phone, formatarSaldoDia(descricao, produto.macrosPor100g.kcal, saldo, metas, streak));
        await dispararAlertaOvershoot(phone, saldo, metas);
      } else {
        const rotulo = await lerRotulo(base64, mimetype);
        if (rotulo) {
          await registrarRefeicao(paciente.id, rotulo.produto, rotulo.macros, 'rotulo');
          const saldo = await obterSaldoDia(paciente.id);
          const streak = await calcularStreak(paciente.id, metas);
          await sendText(phone, formatarSaldoDia(rotulo.produto, rotulo.macros.kcal, saldo, metas, streak));
          await dispararAlertaOvershoot(phone, saldo, metas);
        } else {
          await sendText(phone, '❌ Não consegui ler o código de barras ou rótulo. Tente uma foto mais nítida ou descreva a refeição por texto.');
        }
      }
      return;
    }

    if (tipo === 'rotulo') {
      const rotulo = await lerRotulo(base64, mimetype);
      if (!rotulo) {
        await sendText(phone, '❌ Não consegui ler os valores do rótulo. Tente uma foto mais nítida.');
        return;
      }
      await registrarRefeicao(paciente.id, rotulo.produto, rotulo.macros, 'rotulo');
      const saldo = await obterSaldoDia(paciente.id);
      const streak = await calcularStreak(paciente.id, metas);
      await sendText(phone, formatarSaldoDia(rotulo.produto, rotulo.macros.kcal, saldo, metas, streak));
      await dispararAlertaOvershoot(phone, saldo, metas);
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
