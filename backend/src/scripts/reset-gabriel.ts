// One-shot script pra resetar o paciente de teste (Gabriel) pro comeco da
// entrevista. Uso: `docker exec nutrichat_backend npx tsx src/scripts/reset-gabriel.ts`
// Fica em src/ pra rodar dentro do container (só src/ é montado como volume).

import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const WHATSAPP_ALVOS = ['5562995514963', '556295514963'];

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  const { data: antes, error: selErr } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, entrevista_status, entrevista_etapa')
    .in('whatsapp', WHATSAPP_ALVOS);

  if (selErr) {
    console.error('SELECT falhou:', selErr.message);
    process.exit(1);
  }

  console.log('ANTES do reset:');
  console.table(antes);

  if (!antes || antes.length === 0) {
    console.error('Nenhum paciente encontrado.');
    process.exit(1);
  }

  const { error: updErr } = await supabase
    .from('pacientes')
    .update({
      entrevista_status: 'pendente',
      entrevista_etapa: 0,
      entrevista_dados: {},
    })
    .in('whatsapp', WHATSAPP_ALVOS);

  if (updErr) {
    console.error('UPDATE falhou:', updErr.message);
    process.exit(1);
  }

  const { data: depois } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, entrevista_status, entrevista_etapa, entrevista_dados')
    .in('whatsapp', WHATSAPP_ALVOS);

  console.log('DEPOIS do reset:');
  console.table(depois);
  console.log('OK — proximo msg no WhatsApp inicia a entrevista.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
