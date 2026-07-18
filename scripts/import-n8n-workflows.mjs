// Uso: node scripts/import-n8n-workflows.mjs
// Requer: N8N_API_KEY como env var (JWT com scopes de workflow)
// Efeito: importa e ativa os 3 crons; importa o main-webhook desativado (o
// fluxo real do Evolution vai direto pro backend, não passa por N8N).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const N8N_URL = 'https://nutrichat-n8n.fly.dev';
const BACKEND_URL = 'https://nutrichat-backend.fly.dev';
const WORKFLOWS_DIR = 'n8n/workflows';

const KEEP_INACTIVE = new Set(['nutrichat-main-webhook.json']);

const apiKey = process.env.N8N_API_KEY;
if (!apiKey) {
  console.error('ERRO: N8N_API_KEY não definida.');
  process.exit(1);
}

const headers = {
  'X-N8N-API-KEY': apiKey,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const raw = readFileSync(join(WORKFLOWS_DIR, file), 'utf8');
  const substituted = raw.replaceAll('http://backend:3001', BACKEND_URL);
  const parsed = JSON.parse(substituted);

  const payload = {
    name: parsed.name,
    nodes: parsed.nodes,
    connections: parsed.connections,
    settings: parsed.settings ?? { executionOrder: 'v1' },
  };

  console.log(`\n=== ${file} ===`);
  console.log(`Nodes: ${payload.nodes.length}`);

  const createRes = await fetch(`${N8N_URL}/api/v1/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const createJson = await createRes.json();

  if (!createRes.ok) {
    console.error(`  IMPORT FAIL (${createRes.status}):`, JSON.stringify(createJson));
    continue;
  }

  const id = createJson.id;
  console.log(`  imported id=${id}`);

  if (KEEP_INACTIVE.has(file)) {
    console.log('  mantido INATIVO (fluxo real vai direto pro backend)');
    continue;
  }

  const activateRes = await fetch(`${N8N_URL}/api/v1/workflows/${id}/activate`, {
    method: 'POST',
    headers,
  });
  const activateJson = await activateRes.json();

  if (!activateRes.ok) {
    console.error(`  ACTIVATE FAIL (${activateRes.status}):`, JSON.stringify(activateJson));
  } else {
    console.log(`  ACTIVE ✓ (active=${activateJson.active})`);
  }
}

console.log('\n---\nDone.');
