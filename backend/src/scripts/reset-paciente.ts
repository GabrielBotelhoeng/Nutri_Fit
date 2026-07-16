// Script pra resetar um paciente pro comeco da entrevista.
// Uso: `docker exec nutrichat_backend npx tsx src/scripts/reset-paciente.ts 5511987654321`
// Aceita 1+ WhatsApps (12 ou 13 digitos). Fica em src/ pra rodar dentro do
// container (so src/ e montado como volume).

import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const WHATSAPP_RE = /^55\d{10,11}$/;

async function main() {
  const alvos = process.argv.slice(2);
  if (alvos.length === 0) {
    console.error('Uso: npx tsx src/scripts/reset-paciente.ts <whatsapp> [whatsapp...]');
    console.error('Ex.: npx tsx src/scripts/reset-paciente.ts 5511987654321');
    process.exit(1);
  }
  const invalidos = alvos.filter((w) => !WHATSAPP_RE.test(w));
  if (invalidos.length > 0) {
    console.error(`WhatsApp em formato invalido: ${invalidos.join(', ')}`);
    console.error('Use 55 + DDD + 9? + 8 digitos (12 ou 13 no total).');
    process.exit(1);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  const { data: antes, error: selErr } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, entrevista_status, entrevista_etapa')
    .in('whatsapp', alvos);

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
    .in('whatsapp', alvos);

  if (updErr) {
    console.error('UPDATE falhou:', updErr.message);
    process.exit(1);
  }

  const { data: depois } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, entrevista_status, entrevista_etapa, entrevista_dados')
    .in('whatsapp', alvos);

  console.log('DEPOIS do reset:');
  console.table(depois);
  console.log('OK — proximo msg no WhatsApp inicia a entrevista.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
