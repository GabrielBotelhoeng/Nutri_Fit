import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { sendText } from './evolution';
import { hojeLocal, somarDias } from '../utils/datas';
import { redactName } from '../utils/redact';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export async function verificarExpiracoes(): Promise<void> {
  const hoje = hojeLocal();

  const { data: vencidos, error: errVencidos } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp')
    .lte('data_expiracao', hoje)
    .eq('ativo', true);

  if (errVencidos) {
    console.error('[expiracao] Erro ao buscar vencidos:', errVencidos.message);
  } else if (vencidos && vencidos.length > 0) {
    for (const p of vencidos) {
      await supabase.from('pacientes').update({ ativo: false }).eq('id', p.id);
      await sendText(
        p.whatsapp as string,
        `⏰ Seu plano NutriChat venceu hoje. Para continuar contando com o acompanhamento nutricional, entre em contato com seu nutricionista para renovar. 💚`,
      );
      console.log(`[expiracao] Paciente ${redactName(p.nome)} bloqueado (plano vencido)`);
    }
  }

  const dataLimite = somarDias(hoje, 3);
  const dataAmanha = somarDias(hoje, 1);

  const { data: expirando, error: errExpirando } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, data_expiracao')
    .gte('data_expiracao', dataAmanha)
    .lte('data_expiracao', dataLimite)
    .eq('ativo', true);

  if (errExpirando) {
    console.error('[expiracao] Erro ao buscar expirando:', errExpirando.message);
  } else if (expirando && expirando.length > 0) {
    for (const p of expirando) {
      const dataExp = new Date(p.data_expiracao as string);
      const diffDias = Math.ceil((dataExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const diasStr = diffDias === 1 ? '1 dia' : `${diffDias} dias`;
      await sendText(
        p.whatsapp as string,
        `⚠️ Atenção, ${p.nome}! Seu plano NutriChat vence em *${diasStr}*.\n\nPara continuar acompanhando sua dieta, renove com seu nutricionista. 💚`,
      );
      console.log(`[expiracao] Aviso enviado para ${redactName(p.nome)} — vence em ${diasStr}`);
    }
  }

  console.log('[expiracao] Verificacao concluida');
}
