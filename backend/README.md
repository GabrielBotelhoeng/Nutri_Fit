# NutriChat — Backend

Serviço do agente NutriChat: recebe webhooks da Evolution API (WhatsApp),
conduz a conversa com o paciente via Claude + RAG, registra refeições
(texto/áudio/foto/barcode) e expõe endpoints internos para os crons do N8N.

**Live:** <https://nutrichat-backend.fly.dev>

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express 4 + helmet + express-rate-limit + cors |
| IA | Claude Sonnet 4.6 (Anthropic) + Groq Whisper (áudio) + OpenAI text-embedding-3-small (RAG) |
| Banco | Supabase (Postgres + pgvector) |
| Testes | Vitest (465 casos) |
| Deploy | Fly.io (Docker, região `gru`) |

## Endpoints

Todos sob `/api/*`, com rate-limit 300 req/min por IP.

| Rota | Método | Autenticação | Uso |
|---|---|---|---|
| `/health` | GET | — | Liveness probe (Fly + smoke test) |
| `/api/webhook` | POST | `X-Webhook-Secret: EVOLUTION_WEBHOOK_SECRET` | Recebe `messages.upsert` da Evolution |
| `/api/rag/*` | POST | `x-internal-key: INTERNAL_API_KEY` | Upload/indexação de PDF de dieta |
| `/api/boas-vindas` | POST | `x-internal-key` | Dispara msg de onboarding (chamado pelo painel após cadastro) |
| `/api/pacientes/*` | GET/POST/DELETE | Bearer Supabase | CRUD de pacientes (chamado pelo painel) |
| `/api/alertas/disparar` | POST | `x-internal-key` | Cron N8N (15min) — refeição/água/suplemento (body: `{horario:"HH:MM"}`) |
| `/api/expiracao/*` | POST | `x-internal-key` | Cron N8N (diário 09h) — avisa vencimento de plano |
| `/api/relatorio/*` | POST | `x-internal-key` | Cron N8N (domingo 08h) — relatório semanal |
| `/api/agua/*` | POST | `x-internal-key` | Legado — hoje é subset de `/api/alertas/disparar` |

## Setup local

```bash
# 1. Copie o exemplo na raiz do repo e preencha
cd .. && cp .env.example .env

# 2. Suba a stack completa (backend + postgres + evolution + n8n + redis)
docker compose -f docker-compose.local.yml up -d

# ou rode só o backend fora do docker
cd backend
npm install
npm run dev   # tsx watch src/index.ts
```

## Variáveis de ambiente

Ver `.env.example` na raiz do repo. Obrigatórias:

| Var | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Acesso ao banco + auth |
| `CLAUDE_API_KEY` | Anthropic (agente + dose de suplemento LLM) |
| `GROQ_API_KEY` | Whisper (transcrição de áudio) |
| `OPENAI_API_KEY` | Embeddings do RAG |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Envio de msgs pra Evolution |
| `EVOLUTION_WEBHOOK_SECRET` | Valida `X-Webhook-Secret` do webhook |
| `INTERNAL_API_KEY` | Valida `x-internal-key` dos crons N8N e uploads do painel |
| `CORS_ORIGIN` | Whitelist do painel (lista separada por vírgula) |

## Testes e qualidade

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (465 casos)
npm run test:run    # vitest run (uma passada, sai)
```

Baseline atual: **465/465 verdes**, typecheck limpo.

## Deploy (Fly.io)

```bash
fly deploy                       # build + release
fly logs                         # cauda de logs em tempo real
fly ssh console -a nutrichat-backend
fly secrets set FOO=bar          # sem redeploy explícito
```

Config em `fly.toml`:
- App: `nutrichat-backend`, região `gru`
- Porta interna: 3001 (força HTTPS)
- `auto_stop_machines = "stop"` + `min_machines_running = 0` — economiza
  na hibernação, primeira msg pode ter cold start de ~2s

## Fluxo de mensagem

```
WhatsApp → Evolution (Fly)
        → POST https://nutrichat-backend.fly.dev/api/webhook
        → agentService (routeamento por intent)
        → Claude / Groq / OpenAI / Supabase (conforme intent)
        → resposta via Evolution
        → WhatsApp
```

N8N **não intercepta** mensagens. Ele só bate nos endpoints administrativos
(`/api/alertas`, `/api/expiracao`, `/api/relatorio`) via cron.

## Estrutura

```
src/
  index.ts                 # Bootstrap (helmet, cors, rate-limit, mount /api)
  routes/                  # webhook, api, rag, boas-vindas, alertas, expiracao, relatorio, agua, pacientes, health
  services/                # agent, conversation, rag, refeicoes, suplementos-llm, ...
  middleware/              # webhookAuth (secret), internalAuth (x-internal-key)
  utils/redact.ts          # Mascara telefone e nome nos logs
tests/                     # 27 arquivos vitest
Dockerfile                 # Runtime prod (multi-stage, npm run build → node dist/)
Dockerfile.dev             # Dev com tsx watch
fly.toml                   # Config Fly
```

## Segurança

- `helmet` + rate-limit em `/api/*` (300 req/IP/min)
- Webhook exige `X-Webhook-Secret` (rejeita 401 sem)
- Endpoints administrativos exigem `x-internal-key` (rejeita 401 sem)
- CORS restrito a `CORS_ORIGIN` (allowlist explícita)
- Logs mascaram telefone e nome do paciente (`utils/redact.ts`)
- Segredos só via env, nunca commitados
