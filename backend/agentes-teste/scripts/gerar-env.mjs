// Gera backend/.env.test a partir do Supabase LOCAL (`npx supabase start` na raiz).
// As chaves locais são as fixas de demonstração do Supabase CLI — não são segredo.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raiz = resolve(backend, '..');
const saida = execSync('npx --yes supabase@2 status -o json', { cwd: raiz, encoding: 'utf-8' });
const s = JSON.parse(saida.slice(saida.indexOf('{')));
const host = new URL(s.API_URL).hostname;
if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`Supabase não é local: ${host}`);
writeFileSync(
  resolve(backend, '.env.test'),
  [
    '# Gerado por agentes-teste/scripts/gerar-env.mjs — Supabase LOCAL (não é produção)',
    `SUPABASE_URL=${s.API_URL}`,
    `SUPABASE_ANON_KEY=${s.ANON_KEY}`,
    `SUPABASE_SERVICE_KEY=${s.SERVICE_ROLE_KEY}`,
    `SUPABASE_DB_URL=${s.DB_URL}`,
    '',
  ].join('\n'),
);
console.log(`.env.test gerado (Supabase local em ${s.API_URL})`);
