import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { query as ragQuery } from './rag';
import { sendText } from './evolution';
import { getEstado as getEstadoConv, atualizarEstado, UltimaRefeicao } from './conversation';
import type { PacienteInfo } from './conversation';
import { obterMetas, MacrosDiarios } from './calculos';

// Janela em minutos durante a qual uma refeicao recente ainda pode ser
// alvo de "correcao". Fora dela, frases como "na verdade foi assim" voltam
// a ser registro novo — evita que o paciente acabe "corrigindo" o almoco
// quando ja jantou.
export const TTL_ULTIMA_REFEICAO_MIN = 60;

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export interface MacrosRefeicao {
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
  agua_ml?: number;
}

// Item individual da analise estruturada (P0-2). `material` distingue
// alimento substancial (frango, arroz, banana) de aditivo/bebida zero
// (sal, agua, coca zero, cafe preto) — so itens materiais sem quantidade
// disparam pergunta antes do registro.
export interface ItemRefeicao {
  nome: string;
  quantidade_g: number;
  quantidade_informada: boolean;
  material: boolean;
}

export interface AnaliseRefeicao {
  itens: ItemRefeicao[];
  totais: MacrosRefeicao;
}

function extrairJSON(texto: string): unknown {
  const limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(limpo);
}

function sanitizarMacros(m: MacrosRefeicao): MacrosRefeicao {
  const san = (v: number) => (isNaN(v) || v < 0 ? 0 : Math.min(v, 9999));
  return { kcal: san(m.kcal), proteina_g: san(m.proteina_g), carbo_g: san(m.carbo_g), gordura_g: san(m.gordura_g) };
}

// Output estruturado por item (P0-2). Resolve a "suposicao silenciosa":
// o Haiku precisa marcar quais itens tiveram quantidade informada pelo
// paciente vs quais foram estimados, pra o agente perguntar antes de
// registrar (so se for item material) e o card poder marcar "_(estimei)_".
export async function analisarRefeicaoComClaude(descricao: string): Promise<AnaliseRefeicao> {
  const prompt = `Você é um assistente nutricional. Analise a refeição descrita pelo paciente e devolva uma decomposição por item.

Refeição: "${descricao}"

RESPONDA APENAS COM JSON VÁLIDO no formato:
{
  "itens": [
    {
      "nome": "nome curto do alimento (ex.: 'Frango grelhado', 'Arroz branco', 'Coca Zero')",
      "quantidade_g": numero em gramas (ou ml para liquidos),
      "quantidade_informada": true se o paciente disse a quantidade EXPLICITA (ex.: '200g', '100ml', '2 colheres'); false se você teve que estimar,
      "material": true para alimentos substanciais que contribuem com macros (carnes, arroz, feijao, frutas, paes); false para itens sem macros relevantes (agua, cafe preto, refrigerante zero, sal, tempero, chá sem açúcar)
    }
  ],
  "totais": {"kcal": number, "proteina_g": number, "carbo_g": number, "gordura_g": number}
}

Regras OBRIGATÓRIAS:
- Para cada item da refeição, gere uma entrada em "itens".
- Use porção típica brasileira ao estimar (ex.: arroz médio ~100g, colher de feijão ~60g, fatia de pão ~30g).
- "quantidade_informada" deve ser true APENAS quando o paciente deu um número explícito (gramas, ml, colheres, fatias, unidades). Se ele só falou "com arroz", marque false.
- "material" diferencia o que tem caloria real do que é bebida zero ou tempero — bebida zero, agua, café preto, chá sem açúcar e temperos são SEMPRE material:false.
- "totais" deve ser a SOMA exata dos macros de todos os itens.
- Não inclua comentários ou markdown. Apenas JSON puro.`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const raw = extrairJSON(texto) as { itens?: unknown; totais?: Record<string, number> };
    const itensRaw = Array.isArray(raw.itens) ? raw.itens : [];
    const itens: ItemRefeicao[] = itensRaw.map((i) => {
      const it = i as Record<string, unknown>;
      return {
        nome: typeof it['nome'] === 'string' ? (it['nome'] as string) : 'item',
        quantidade_g: Number(it['quantidade_g']) || 0,
        quantidade_informada: it['quantidade_informada'] === true,
        material: it['material'] === true,
      };
    });
    const totais = sanitizarMacros({
      kcal:       Number(raw.totais?.['kcal'])       || 0,
      proteina_g: Number(raw.totais?.['proteina_g']) || 0,
      carbo_g:    Number(raw.totais?.['carbo_g'])    || 0,
      gordura_g:  Number(raw.totais?.['gordura_g'])  || 0,
    });
    return { itens, totais };
  } catch {
    console.error('[meal] Claude retornou JSON inválido para analise estruturada:', texto);
    return { itens: [], totais: { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 } };
  }
}

// Wrapper de compatibilidade: alguns fluxos (correcao, foto) so querem o
// total agregado. Mantem a API original sem propagar `itens` por chamadas
// que nao precisam.
export async function calcularMacrosComClaude(descricao: string): Promise<MacrosRefeicao> {
  const { totais } = await analisarRefeicaoComClaude(descricao);
  return totais;
}

// Detecta o primeiro item material sem quantidade informada — base do
// fluxo "perguntar uma vez antes de registrar" (P0-2). Retorna null quando
// todos os itens materiais ja tem quantidade explicita (ou so ha bebidas
// zero/temperos), ou seja, quando NAO se deve interromper o registro.
export function detectarItemMaterialSemQuantidade(itens: ItemRefeicao[]): ItemRefeicao | null {
  return itens.find((i) => i.material && !i.quantidade_informada) ?? null;
}

// Retorna o snapshot do que foi gravado — usado pelo agente pra montar
// `ultima_refeicao` em entrevista_dados (base do fluxo de correcao P0-1).
// `itens` e opcional pra manter compatibilidade com chamadas que ainda
// nao passam o detalhamento (foto, barcode, rotulo).
export async function registrarRefeicao(
  pacienteId: string,
  descricao: string,
  macros: MacrosRefeicao,
  tipoRegistro: 'texto' | 'audio' | 'foto' | 'codigo_barras' | 'rotulo',
  itens?: UltimaRefeicao['itens'],
): Promise<UltimaRefeicao> {
  const m = sanitizarMacros(macros);
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: inserted, error: insertError } = await supabase
    .from('refeicoes')
    .insert({
      paciente_id: pacienteId,
      descricao,
      kcal: m.kcal,
      proteina_g: m.proteina_g,
      carbo_g: m.carbo_g,
      gordura_g: m.gordura_g,
      tipo_registro: tipoRegistro,
    })
    .select('id, registrado_em')
    .single();
  if (insertError || !inserted) throw new Error(`[meal] Falha ao inserir refeição: ${insertError?.message ?? 'sem dado retornado'}`);

  // Acumulação incremental via RPC — NUNCA usar upsert direto (sobrescreve em vez de somar)
  const { error: rpcError } = await supabase.rpc('acumular_registro_diario', {
    p_paciente_id: pacienteId,
    p_data: hoje,
    p_kcal: m.kcal,
    p_proteina_g: m.proteina_g,
    p_carbo_g: m.carbo_g,
    p_gordura_g: m.gordura_g,
  });
  if (rpcError) throw new Error(`[meal] Falha ao acumular saldo: ${rpcError.message}`);

  const ultima: UltimaRefeicao = {
    id: inserted.id as string,
    descricao,
    macros: m,
    itens,
    registrado_em: (inserted.registrado_em as string) ?? new Date().toISOString(),
  };

  // Persistir snapshot da ultima refeicao no estado para o fluxo de correcao.
  // Try/catch isolado: falha aqui NAO pode derrubar a confirmacao do registro
  // (paciente ja recebeu confirmacao no chat; correcao ficaria so indisponivel
  // ate proxima refeicao).
  try {
    await atualizarEstado(pacienteId, { dados: { ultima_refeicao: ultima } as Parameters<typeof atualizarEstado>[1]['dados'] });
  } catch (err) {
    console.error('[meal] Falha ao persistir ultima_refeicao no estado:', err);
  }

  return ultima;
}

// Verifica se a ultima refeicao registrada ainda esta dentro da janela
// TTL_ULTIMA_REFEICAO_MIN. Fora dela, retorna null — o agente trata como
// registro novo.
export function obterUltimaRefeicaoSeRecente(
  dadosEstado: Record<string, unknown>,
): UltimaRefeicao | null {
  const raw = dadosEstado['ultima_refeicao'] as UltimaRefeicao | null | undefined;
  if (!raw || !raw.id || !raw.registrado_em) return null;
  const idadeMs = Date.now() - new Date(raw.registrado_em).getTime();
  if (idadeMs > TTL_ULTIMA_REFEICAO_MIN * 60 * 1000) return null;
  return raw;
}

// Substitui a ultima refeicao do paciente: faz UPDATE na linha de `refeicoes`
// e aplica o delta (novos macros - antigos) em `registros_diarios` via RPC
// dedicada (garante GREATEST(0, ...) — saldo nunca fica negativo).
// Sobrescreve `ultima_refeicao` no estado com os novos valores pra permitir
// correcoes em cadeia ("na verdade foram 250g, esqueci o feijao...").
export async function corrigirUltimaRefeicao(
  pacienteId: string,
  ultima: UltimaRefeicao,
  novaDescricao: string,
  novosMacros: MacrosRefeicao,
  novosItens?: UltimaRefeicao['itens'],
): Promise<UltimaRefeicao> {
  const novos = sanitizarMacros(novosMacros);
  const hoje = new Date().toISOString().slice(0, 10);

  const { error: updateError } = await supabase
    .from('refeicoes')
    .update({
      descricao: novaDescricao,
      kcal: novos.kcal,
      proteina_g: novos.proteina_g,
      carbo_g: novos.carbo_g,
      gordura_g: novos.gordura_g,
    })
    .eq('id', ultima.id)
    .eq('paciente_id', pacienteId);
  if (updateError) throw new Error(`[meal] Falha ao atualizar refeição: ${updateError.message}`);

  const dKcal     = novos.kcal       - ultima.macros.kcal;
  const dProteina = novos.proteina_g - ultima.macros.proteina_g;
  const dCarbo    = novos.carbo_g    - ultima.macros.carbo_g;
  const dGordura  = novos.gordura_g  - ultima.macros.gordura_g;

  const { error: rpcError } = await supabase.rpc('corrigir_registro_diario', {
    p_paciente_id: pacienteId,
    p_data: hoje,
    p_delta_kcal: dKcal,
    p_delta_proteina_g: dProteina,
    p_delta_carbo_g: dCarbo,
    p_delta_gordura_g: dGordura,
  });
  if (rpcError) throw new Error(`[meal] Falha ao corrigir saldo: ${rpcError.message}`);

  const atualizada: UltimaRefeicao = {
    id: ultima.id,
    descricao: novaDescricao,
    macros: novos,
    itens: novosItens ?? ultima.itens,
    registrado_em: ultima.registrado_em,
  };

  try {
    await atualizarEstado(pacienteId, { dados: { ultima_refeicao: atualizada } as Parameters<typeof atualizarEstado>[1]['dados'] });
  } catch (err) {
    console.error('[meal] Falha ao atualizar ultima_refeicao apos correcao:', err);
  }

  return atualizada;
}

export async function obterSaldoDia(pacienteId: string): Promise<MacrosRefeicao> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('registros_diarios')
    .select('kcal_consumido, proteina_g, carbo_g, gordura_g, agua_ml')
    .eq('paciente_id', pacienteId)
    .eq('data', hoje)
    .maybeSingle();

  if (error || !data) return { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0, agua_ml: 0 };
  return {
    kcal:       Number(data.kcal_consumido),
    proteina_g: Number(data.proteina_g),
    carbo_g:    Number(data.carbo_g),
    gordura_g:  Number(data.gordura_g),
    agua_ml:    Number(data.agua_ml ?? 0),
  };
}

// Limite a partir do qual o paciente recebe alerta proativo de excesso calorico.
// 110% e tolerancia clinica razoavel: 100% e meta, +10% e overshoot leve digno
// de aviso amigavel (nao critico). Centralizado pra facilitar tunning futuro.
export const OVERSHOOT_THRESHOLD = 1.10;

// Pura: decide se ja passou de 110% da meta calorica do dia.
// Defensiva: meta <= 0 retorna false (sem meta cadastrada, nao alerta).
export function excedeuMetaKcal(saldo: MacrosRefeicao, metas: MacrosDiarios): boolean {
  if (!metas.kcal || metas.kcal <= 0) return false;
  return saldo.kcal > metas.kcal * OVERSHOOT_THRESHOLD;
}

// Side-effect: dispara alerta proativo se o saldo passou de 110% da meta.
// Try/catch isolado interno — falha de notificacao NAO derruba o registro
// da refeicao. Mesma filosofia do sync de alertas_config em agent.ts:443.
export async function dispararAlertaOvershoot(
  phone: string,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
): Promise<void> {
  if (!excedeuMetaKcal(saldo, metas)) return;
  try {
    const pct = Math.round((saldo.kcal / metas.kcal) * 100);
    await sendText(
      phone,
      `⚠️ Voce ja consumiu ${pct}% da sua meta calorica de hoje (${Math.round(saldo.kcal)} / ${Math.round(metas.kcal)} kcal).\n\n` +
      `Sugiro pausar a proxima refeicao ou trocar por algo mais leve. 💚`,
    );
  } catch (err) {
    console.error('[meal] Falha ao disparar alerta de overshoot:', err);
  }
}

// Barra de progresso em texto pra WhatsApp. Satura em 100% (n blocos cheios)
// quando o paciente passa da meta — a "ultrapassagem" e comunicada na micro-
// mensagem final, nao na barra. Trata meta<=0 e atual<0 como zero.
export function barraProgresso(atual: number, meta: number, blocos = 10): string {
  if (meta <= 0 || atual <= 0) return '▱'.repeat(blocos);
  const proporcao = Math.min(atual / meta, 1);
  const cheios = Math.round(proporcao * blocos);
  return '▰'.repeat(cheios) + '▱'.repeat(blocos - cheios);
}

// Micro-mensagem final do card. Cinco estados, escolhidos pra dar feedback
// adaptativo sem nunca culpar:
// - ultrapassou (kcal > 110% meta): gentil e orientador
// - perto_limite (kcal 103-110%): aviso suave — bateu mas ja passou um pouco
// - bateu (kcal 95-102% E proteina >= meta): celebracao limpa
// - perto (kcal >= 85% meta): reta final
// - abaixo (default): ainda falta — destacar proteina se ela esta mais
//   atrasada (paciente comendo carbo demais e o ponto mais comum de falha)
export function microMensagemFinal(saldo: MacrosRefeicao, metas: MacrosDiarios): string {
  const kcalAtual = saldo.kcal;
  const kcalMeta = metas.kcal;
  const protAtual = saldo.proteina_g;
  const protMeta = metas.proteina_g;
  if (kcalMeta <= 0) return '';

  const ratioKcal = kcalAtual / kcalMeta;
  const ratioProt = protMeta > 0 ? protAtual / protMeta : 1;

  if (ratioKcal > 1.10) {
    const excesso = Math.round(kcalAtual - kcalMeta);
    return `_Você passou *${excesso} kcal* da meta hoje — sem problema, amanhã equilibra. 👍_`;
  }
  if (ratioKcal > 1.02) {
    const excesso = Math.round(kcalAtual - kcalMeta);
    return `🎯 _Meta batida — passou *${excesso} kcal* da meta, ainda dentro da margem. 👍_`;
  }
  if (ratioKcal >= 0.95 && ratioProt >= 1.0) {
    return `🎯 *Meta do dia batida!* Mandou bem.`;
  }
  if (ratioKcal >= 0.85) {
    const faltam = Math.max(0, Math.round(kcalMeta - kcalAtual));
    return `🔥 Reta final — faltam *${faltam} kcal* pra fechar o dia.`;
  }
  // Abaixo: priorizar proteina se faltar mais que 30% dela.
  const faltamKcal = Math.max(0, Math.round(kcalMeta - kcalAtual));
  const faltamProt = Math.max(0, Math.round(protMeta - protAtual));
  if (ratioProt < 0.70 && faltamProt > 0) {
    return `💪 Faltam *${faltamProt}g de proteína* e *${faltamKcal} kcal* pra fechar o dia. Tá indo bem!`;
  }
  return `💪 Faltam *${faltamKcal} kcal* pra fechar o dia. Tá indo bem!`;
}

// Bloco de progresso do dia — barras de texto por macro + micro-mensagem.
// Usado tanto pelo card per-item (P0-2) quanto pelo formatarSaldoDia (foto).
// A linha de agua so aparece quando o paciente tem meta cadastrada
// (`metas.agua_ml`) — calculada a partir do peso na entrevista.
function formatarBlocoProgressoDia(saldo: MacrosRefeicao, metas: MacrosDiarios): string {
  const linhas = [
    `🔥 Energia    ${barraProgresso(saldo.kcal, metas.kcal)}  ${Math.round(saldo.kcal)} / ${Math.round(metas.kcal)} kcal`,
    `🍗 Proteína   ${barraProgresso(saldo.proteina_g, metas.proteina_g)}  ${Math.round(saldo.proteina_g)} / ${Math.round(metas.proteina_g)} g`,
    `🍚 Carbo      ${barraProgresso(saldo.carbo_g, metas.carbo_g)}  ${Math.round(saldo.carbo_g)} / ${Math.round(metas.carbo_g)} g`,
    `🥑 Gordura    ${barraProgresso(saldo.gordura_g, metas.gordura_g)}  ${Math.round(saldo.gordura_g)} / ${Math.round(metas.gordura_g)} g`,
  ];
  if (metas.agua_ml && metas.agua_ml > 0) {
    const aguaAtual = saldo.agua_ml ?? 0;
    linhas.push(
      `💧 Água       ${barraProgresso(aguaAtual, metas.agua_ml)}  ${Math.round(aguaAtual)} / ${Math.round(metas.agua_ml)} ml`,
    );
  }
  const micro = microMensagemFinal(saldo, metas);
  return `📊 *Seu dia até agora*\n${linhas.join('\n')}${micro ? `\n\n${micro}` : ''}`;
}

export function formatarSaldoDia(
  descricao: string,
  kcalRegistrado: number,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
): string {
  return (
    `✅ *Registrado:* ${descricao} (${Math.round(kcalRegistrado)} kcal)\n\n` +
    formatarBlocoProgressoDia(saldo, metas)
  );
}

// Card P0-2: lista itens materiais com qtd, marcando "_(estimei)_" quando
// quantidade_informada=false. Itens nao-materiais (coca zero, agua, cafe)
// viram um rodape leve "+ X" — confirma que o bot reparou sem inflar o card.
// A secao 3 (redesenho) substitui o saldo cru por barras de progresso.
export function formatarCardRefeicao(
  analise: AnaliseRefeicao,
  saldo: MacrosRefeicao,
  metas: MacrosDiarios,
): string {
  const materiais = analise.itens.filter((i) => i.material);
  const naoMateriais = analise.itens.filter((i) => !i.material);

  const linhasItens = materiais.map((i) => {
    const qtd = Math.round(i.quantidade_g);
    const marcador = i.quantidade_informada ? '' : ' _(estimei)_';
    const prefixo = i.quantidade_informada ? '' : '~';
    return `• ${i.nome} — ${prefixo}${qtd}g${marcador}`;
  });

  const rodapeExtras = naoMateriais.length > 0
    ? `\n_+ ${naoMateriais.map((i) => i.nome).join(', ')}_`
    : '';

  const t = analise.totais;
  const linhaRefeicao =
    `_Essa refeição:_ ${Math.round(t.kcal)} kcal · ` +
    `${Math.round(t.proteina_g)}g P · ${Math.round(t.carbo_g)}g C · ${Math.round(t.gordura_g)}g G`;

  return (
    `✅ *Registrado!*\n\n` +
    `${linhasItens.join('\n')}${rodapeExtras}\n\n` +
    `${linhaRefeicao}\n\n` +
    formatarBlocoProgressoDia(saldo, metas)
  );
}

export async function sugerirSubstituicao(
  pacienteId: string,
  pacienteNome: string,
  alimentoAusente: string,
): Promise<string> {
  const contexto = await ragQuery(pacienteId, `substituto para ${alimentoAusente}`);
  if (!contexto) {
    return `Não encontrei substitutos para "${alimentoAusente}" na sua dieta. Consulte seu nutricionista.`;
  }

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `Você é o NutriChat, assistente nutricional de ${pacienteNome}. Seu nutricionista prescreveu a dieta abaixo.`,
    messages: [{
      role: 'user',
      content: `Contexto da dieta prescrita:\n${contexto}\n\nO paciente não tem "${alimentoAusente}". Com base APENAS nos alimentos da dieta prescrita acima, sugira alternativas disponíveis. Não invente alimentos que não estão na dieta.`,
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function processarTextoRefeicao(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
): Promise<void> {
  const textoLower = texto.toLowerCase();

  const ehSubstituicao = /substitu|nao tenho|não tenho|alternativa|trocar|troca/.test(textoLower);
  if (ehSubstituicao) {
    const resposta = await sugerirSubstituicao(paciente.id, paciente.nome, texto);
    await sendText(phone, resposta);
    return;
  }

  const ehRegistro = /comi|tomei|bebi|almocei|jantei|caf[eé]|lanche|refeicao|refeição|breakfast|lunch|dinner|g de|ml de|colher|prato|gramas/.test(textoLower);

  if (!ehRegistro) {
    return;
  }

  const analise = await analisarRefeicaoComClaude(texto);

  if (analise.totais.kcal === 0 || analise.itens.length === 0) {
    await sendText(phone, `⚠️ Não consegui estimar os macros para essa refeição. Tente descrever com mais detalhes (ex: "200g de frango grelhado com 100g de arroz").`);
    return;
  }

  // P0-2: se algum item material esta sem quantidade explicita, pergunta
  // UMA vez antes de registrar. A resposta vira pela `refeicao_pendente`
  // (intercept em agent.ts).
  const itemFaltando = detectarItemMaterialSemQuantidade(analise.itens);
  if (itemFaltando) {
    await atualizarEstado(paciente.id, {
      dados: {
        refeicao_pendente: {
          descricao_original: texto,
          analise,
          item_perguntado: itemFaltando.nome,
          timestamp: new Date().toISOString(),
        },
      } as Parameters<typeof atualizarEstado>[1]['dados'],
    });
    await sendText(
      phone,
      `🤔 Quantas gramas de *${itemFaltando.nome}*, mais ou menos?\n\n` +
      `_Se não souber, manda *"estima"* que eu uso uma porção média._`,
    );
    return;
  }

  await registrarRefeicao(paciente.id, texto, analise.totais, 'texto', stripMaterial(analise.itens));

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);

  await sendText(phone, formatarCardRefeicao(analise, saldo, metas));

  await dispararAlertaOvershoot(phone, saldo, metas);
}

// Resposta do paciente a pergunta P0-2 ("quantas gramas de arroz?"). Tres
// caminhos: (a) "estima/nao sei/qualquer" → usa o que ja foi estimado;
// (b) numero → injeta na descricao e recalcula; (c) qualquer outra coisa
// → trata como caminho (a), pra nao prender o paciente em loop. Em todos
// os casos, registra e limpa `refeicao_pendente`.
export async function processarRespostaQuantidade(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
  pendente: {
    descricao_original: string;
    analise: AnaliseRefeicao;
    item_perguntado: string;
  },
): Promise<void> {
  const txt = texto.toLowerCase().trim();
  const aceitarEstimativa = /^(estima|estimar|nao\s+sei|n[aã]o\s+sei|sei\s+l[aá]|qualquer|tanto\s+faz|m[eé]dia|porcao\s+m[eé]dia|por[çc][ãa]o\s+m[eé]dia)\b/.test(txt);
  const matchQtd = texto.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramas?|ml|l|litros?|copos?|colher(?:es)?|colheres|fatias?|unidades?|porc(?:o|ao|ão)es?)?/i);

  let analiseFinal = pendente.analise;
  let descricaoFinal = pendente.descricao_original;

  if (!aceitarEstimativa && matchQtd) {
    descricaoFinal = `${pendente.descricao_original} (${pendente.item_perguntado}: ${matchQtd[0]})`;
    analiseFinal = await analisarRefeicaoComClaude(descricaoFinal);
    if (analiseFinal.totais.kcal === 0 || analiseFinal.itens.length === 0) {
      analiseFinal = pendente.analise;
      descricaoFinal = pendente.descricao_original;
    }
  }

  // Limpa pendencia ANTES de gravar — evita resposta nova ser interpretada
  // como continuacao se algo abaixo falhar.
  await atualizarEstado(paciente.id, {
    dados: { refeicao_pendente: null } as Parameters<typeof atualizarEstado>[1]['dados'],
  });

  await registrarRefeicao(paciente.id, descricaoFinal, analiseFinal.totais, 'texto', stripMaterial(analiseFinal.itens));

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);
  await sendText(phone, formatarCardRefeicao(analiseFinal, saldo, metas));
  await dispararAlertaOvershoot(phone, saldo, metas);
}

// Remove o campo `material` (interno) antes de persistir em UltimaRefeicao.
function stripMaterial(itens: ItemRefeicao[]): UltimaRefeicao['itens'] {
  return itens.map((i) => ({
    nome: i.nome,
    quantidade_g: i.quantidade_g,
    quantidade_informada: i.quantidade_informada,
  }));
}

// TTL da `refeicao_pendente` — 10 min e suficiente pro paciente responder
// "100g" sem o estado ficar preso indefinidamente se ele esquecer.
export const TTL_REFEICAO_PENDENTE_MIN = 10;

export function obterRefeicaoPendenteSeValida(
  dadosEstado: Record<string, unknown>,
): {
  descricao_original: string;
  analise: AnaliseRefeicao;
  item_perguntado: string;
} | null {
  const raw = dadosEstado['refeicao_pendente'] as {
    descricao_original?: string;
    analise?: AnaliseRefeicao;
    item_perguntado?: string;
    timestamp?: string;
  } | null | undefined;
  if (!raw || !raw.descricao_original || !raw.analise || !raw.item_perguntado || !raw.timestamp) return null;
  const idadeMs = Date.now() - new Date(raw.timestamp).getTime();
  if (idadeMs > TTL_REFEICAO_PENDENTE_MIN * 60 * 1000) return null;
  return {
    descricao_original: raw.descricao_original,
    analise: raw.analise,
    item_perguntado: raw.item_perguntado,
  };
}

// Fluxo de correcao da ultima refeicao registrada (P0-1). Calcula novos
// macros a partir da nova descricao, faz UPDATE da linha em `refeicoes` e
// aplica o delta sobre `registros_diarios`. Mensagem final deixa explicito
// que foi correcao (nao acrescimo) e mostra o saldo ja ajustado.
export async function processarTextoCorrecao(
  phone: string,
  texto: string,
  paciente: PacienteInfo,
  ultima: UltimaRefeicao,
): Promise<void> {
  const novosMacros = await calcularMacrosComClaude(texto);

  if (novosMacros.kcal === 0) {
    await sendText(phone, `⚠️ Não consegui recalcular os macros pra essa correção. Tente descrever com mais detalhes (ex: "foram 200g de frango com 100g de arroz").`);
    return;
  }

  await corrigirUltimaRefeicao(paciente.id, ultima, texto, novosMacros);

  const estado = await getEstadoConv(paciente.id);
  const metas = obterMetas(estado.dados as Record<string, unknown>);
  const saldo = await obterSaldoDia(paciente.id);

  await sendText(
    phone,
    `✏️ *Corrigi a última refeição* (substituí, não somei).\n\n` +
    formatarSaldoDia(texto, novosMacros.kcal, saldo, metas),
  );

  await dispararAlertaOvershoot(phone, saldo, metas);
}
