// Ambiente dos agentes de teste. Roda ANTES de qualquer import do backend.
//
// - Supabase: SEMPRE o local (`npx supabase start`), lido de backend/.env.test.
// - Chaves de IA (Claude/OpenAI): do .env da raiz do repo — o agente responde com o
//   Claude de verdade, que é o ponto destes testes.
// - Evolution: valores fictícios; o envio de WhatsApp é interceptado (ver lib/conversa.ts).
//
// TRAVA: se a URL do Supabase não for local, aborta. Paciente fictício nunca pode ir
// pro banco de produção.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { vi } from 'vitest';

const backendDir = resolve(__dirname, '..');
const envTestPath = resolve(backendDir, '.env.test');
const envRaizPath = resolve(backendDir, '..', '.env');

if (!existsSync(envTestPath)) {
  throw new Error(
    '[agentes-teste] backend/.env.test não existe. Suba o Supabase local e gere o arquivo:\n' +
      '  npx supabase start   (na raiz do repo)\n' +
      '  npm run agentes:env  (em backend/)',
  );
}

const envTeste = parse(readFileSync(envTestPath));
const envRaiz = existsSync(envRaizPath) ? parse(readFileSync(envRaizPath)) : {};

const url = envTeste.SUPABASE_URL ?? '';
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
})();
if (!['127.0.0.1', 'localhost'].includes(host)) {
  throw new Error(
    `[agentes-teste] TRAVA: SUPABASE_URL em .env.test não é local (${host || 'vazio'}). ` +
      'Os agentes de teste só rodam contra o Supabase local.',
  );
}

process.env.SUPABASE_URL = url;
process.env.SUPABASE_ANON_KEY = envTeste.SUPABASE_ANON_KEY;
process.env.SUPABASE_SERVICE_KEY = envTeste.SUPABASE_SERVICE_KEY;

for (const chave of ['CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY'] as const) {
  const valor = process.env[chave] || envRaiz[chave];
  if (!valor) throw new Error(`[agentes-teste] ${chave} ausente (esperado no .env da raiz).`);
  process.env[chave] = valor;
}

process.env.EVOLUTION_API_URL = 'http://evolution.invalid';
process.env.EVOLUTION_API_KEY = 'agentes-teste';
process.env.EVOLUTION_WEBHOOK_SECRET = 'agentes-teste';
process.env.N8N_WEBHOOK_URL = 'http://n8n.invalid';
process.env.INTERNAL_API_KEY = 'agentes-teste';

// pdf-parse roda um "modo debug" quando `module.parent` é indefinido (caso do Vitest)
// e tenta abrir um PDF de exemplo que não existe. As conversas não processam PDF
// (isso acontece no upload da dieta pelo painel), então o módulo é substituído.
vi.mock('pdf-parse', () => ({ default: async () => ({ text: '', numpages: 0 }) }));
