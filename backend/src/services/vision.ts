import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { downloadMedia } from './audio';
import { sendText } from './evolution';
import { buscarPacientePorWhatsapp, getEstado, atualizarEstado } from './conversation';
import type { PacienteInfo } from './conversation';
import { processarCodigoBarras } from './barcode';
import { registrarRefeicao, obterSaldoDia, formatarSaldoDia, dispararAlertaOvershoot, calcularStreak, MacrosRefeicao } from './meal';
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

interface AnalisePrato {
  alimentos: string[];
  confianca: 'alta' | 'media' | 'baixa';
  macros: MacrosRefeicao;
  aviso: string | null;
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

TAREFA: Identifique os alimentos visíveis e estime os macronutrientes.

RESPONDA EM JSON com exatamente este formato:
{"alimentos": ["alimento 1 com quantidade estimada", "alimento 2..."], "confianca": "alta", "kcal": 500, "proteina_g": 30, "carbo_g": 60, "gordura_g": 15, "aviso": null}

Valores de confianca: "alta" (alimentos claramente visíveis), "media" (parcialmente visível), "baixa" (difícil identificar).
Se a porção for incerta, estime conservadoramente e coloque aviso descritivo.
Responda APENAS com JSON válido, sem markdown.`,
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
    };
  } catch {
    console.error('[vision] Falha ao parsear análise de prato:', texto);
    return { alimentos: [], confianca: 'baixa', macros: { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 }, aviso: 'Não consegui analisar o prato' };
  }
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
        await handleConfirmacaoPrato(phone, paciente, analise, metas);
        return;
      } else {
        // Timeout expirado — D-04: processar 1ª foto com aviso, tratar nova como nova 1ª foto
        console.log(`[vision] Timeout foto2 expirou para ${phone} — processando foto1 com aviso`);
        await atualizarEstado(paciente.id, { dados: { aguardando_foto_2: null } });
        const analiseFoto1 = await analisarPrato([aguardando.foto1_base64], mimetype);
        await handleConfirmacaoPrato(
          phone,
          paciente,
          analiseFoto1,
          metas,
          '⚠️ Estimativa baseada em apenas 1 foto (tempo para 2ª foto expirou) — pode variar até 30%.',
        );
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
