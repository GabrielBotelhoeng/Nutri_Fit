import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { sendText } from './evolution';
import { hojeLocal, somarDias } from '../utils/datas';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

interface DadosRelatorio {
  dias_com_registro: number;
  total_kcal: number;
  media_kcal: number;
  media_proteina_g: number;
  media_carbo_g: number;
  media_gordura_g: number;
  media_agua_ml: number;
  dias_bateram_meta: number;
  meta_kcal: number;
}

async function gerarMensagemIncentivo(dados: DadosRelatorio, nomePaciente: string): Promise<string> {
  const prompt = `Você é o NutriChat, assistente nutricional do WhatsApp. Gere uma mensagem motivacional e personalizada para o relatório semanal de ${nomePaciente}.

Dados da semana:
- Dias com registro: ${dados.dias_com_registro}/7
- Total kcal consumido: ${Math.round(dados.total_kcal)} kcal
- Média kcal/dia: ${Math.round(dados.media_kcal)} kcal (meta: ${dados.meta_kcal} kcal)
- Dias que bateram a meta: ${dados.dias_bateram_meta}
- Média proteína: ${Math.round(dados.media_proteina_g)}g/dia
- Média hidratação: ${Math.round(dados.media_agua_ml)}ml/dia

Escreva 1-2 frases de incentivo em português, levando em conta o desempenho. Se foi uma boa semana, parabenize. Se foi fraca, encoraje sem julgamento. Seja caloroso e direto. NÃO use markdown. APENAS texto puro.`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Continue assim!';
}

export async function gerarRelatorioSemanal(): Promise<void> {
  const hoje = hojeLocal();
  const dataInicio = somarDias(hoje, -7);

  const { data: pacientes, error: errPacientes } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp')
    .eq('ativo', true);

  if (errPacientes) {
    console.error('[relatorio] Erro ao buscar pacientes:', errPacientes.message);
    return;
  }

  if (!pacientes || pacientes.length === 0) {
    console.log('[relatorio] Nenhum paciente ativo — skip');
    return;
  }

  for (const p of pacientes) {
    try {
      const { data: registros, error: errRegistros } = await supabase
        .from('registros_diarios')
        .select('kcal_consumido, proteina_g, carbo_g, gordura_g, agua_ml')
        .eq('paciente_id', p.id)
        .gte('data', dataInicio)
        .lt('data', hoje);

      if (errRegistros) {
        console.error(`[relatorio] Erro ao buscar registros de ${p.nome}:`, errRegistros.message);
        continue;
      }

      if (!registros || registros.length === 0) {
        await sendText(
          p.whatsapp as string,
          `📊 *Relatório Semanal — ${p.nome}*\n\nEsta semana não encontrei registros de refeições. Lembre-se de registrar o que você come para acompanharmos juntos! 💚`,
        );
        continue;
      }

      const n = registros.length;
      const totalKcal = registros.reduce((s, r) => s + Number(r.kcal_consumido), 0);
      const mediaKcal = totalKcal / n;
      const mediaProteina = registros.reduce((s, r) => s + Number(r.proteina_g), 0) / n;
      const mediaCarbo = registros.reduce((s, r) => s + Number(r.carbo_g), 0) / n;
      const mediaGordura = registros.reduce((s, r) => s + Number(r.gordura_g), 0) / n;
      const mediaAgua = registros.reduce((s, r) => s + Number(r.agua_ml), 0) / n;

      const { data: pacienteEntrevista } = await supabase
        .from('pacientes')
        .select('entrevista_dados')
        .eq('id', p.id)
        .maybeSingle();
      const metaKcal =
        Number((pacienteEntrevista?.entrevista_dados as Record<string, unknown>)?.['tdee_kcal']) ||
        2000;

      const diasBateramMeta = registros.filter(
        (r) => Number(r.kcal_consumido) >= metaKcal * 0.9,
      ).length;

      const dados: DadosRelatorio = {
        dias_com_registro: n,
        total_kcal: totalKcal,
        media_kcal: mediaKcal,
        media_proteina_g: mediaProteina,
        media_carbo_g: mediaCarbo,
        media_gordura_g: mediaGordura,
        media_agua_ml: mediaAgua,
        dias_bateram_meta: diasBateramMeta,
        meta_kcal: metaKcal,
      };

      const incentivo = await gerarMensagemIncentivo(dados, p.nome as string);

      const mensagem =
        `📊 *Relatório Semanal — ${p.nome}*\n\n` +
        `🗓️ Dias com registro: *${n}/7*\n` +
        `🔥 Total kcal: *${Math.round(totalKcal)} kcal*\n` +
        `📈 Média diária: *${Math.round(mediaKcal)} kcal* (meta: ${metaKcal} kcal)\n` +
        `🎯 Dias que bateram a meta: *${diasBateramMeta}*\n\n` +
        `💪 Macros médios/dia:\n` +
        `• Proteína: ${Math.round(mediaProteina)}g\n` +
        `• Carboidratos: ${Math.round(mediaCarbo)}g\n` +
        `• Gordura: ${Math.round(mediaGordura)}g\n\n` +
        `💧 Hidratação média: *${Math.round(mediaAgua)}ml/dia*\n\n` +
        `💚 ${incentivo}`;

      await sendText(p.whatsapp as string, mensagem);
      console.log(`[relatorio] Relatorio enviado para ${p.nome}`);
    } catch (err) {
      console.error(`[relatorio] Erro ao processar paciente ${p.nome}:`, err);
    }
  }

  console.log('[relatorio] Relatorio semanal concluido');
}
