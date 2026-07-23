# NutriChat

Assistente nutricional via WhatsApp para acompanhamento diario de dieta,
hidratacao e suplementacao. O paciente conversa com o bot por texto,
audio, foto do prato ou codigo de barras; o bot registra as refeicoes,
compara com as metas prescritas pelo nutricionista e envia lembretes
nos horarios combinados.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 18+ / Express / TypeScript (`backend/`) |
| Painel web | React + Vite (`nutrichat-painel/`) |
| Banco / vetor | Supabase (Postgres + pgvector) |
| WhatsApp | Evolution API v2 (Docker) |
| Orquestracao | N8N (Docker) |
| IA | Claude Sonnet 4.6 (Anthropic) + Groq Whisper + OpenAI text-embedding-3-small |

## Setup local

```bash
# 1. Copie o exemplo e preencha com suas chaves
cp .env.example .env
# edite .env com valores reais

# 2. Suba a stack local
docker compose -f docker-compose.local.yml up -d

# 3. Verifique containers
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Esperado: `nutrichat_backend`, `nutrichat_evolution`, `nutrichat_n8n`,
`nutrichat_redis`, `nutrichat_postgres`.

## Portas locais

| Servico | URL |
|---|---|
| Backend | `http://localhost:3001` (webhook em `/api/webhook`) |
| Evolution API Manager | `http://localhost:8081/manager/` |
| N8N | `http://localhost:5678` |
| Postgres | `localhost:5432` |

## Fluxo de mensagem

```
WhatsApp -> Evolution API -> POST backend:3001/api/webhook -> agent -> Evolution API -> WhatsApp
```

O N8N nao intercepta mensagens do paciente. Ele apenas dispara jobs
periodicos (lembretes de refeicao, hidratacao, expiracao de plano,
relatorio semanal) via cron chamando endpoints internos do backend
protegidos pelo header `x-internal-key`.

## Testes

```bash
cd backend
npm run typecheck   # tsc --noEmit
npm test            # vitest (465 casos)
```

## Estrutura

```
backend/                Express + TypeScript, servico do agente
nutrichat-painel/       Painel React do nutricionista
n8n/workflows/          Definicoes JSON dos crons N8N
supabase/migrations/    Migrations SQL do banco
docker/                 Bootstrap do Postgres local
docker-compose.local.yml   Stack completa para dev
deploy/                 fly.toml + Dockerfile de Evolution e N8N (Fly.io)
docs/DEPLOY.md          Checklist de deploy final + smoke test E2E
```

## Deploy em producao

Toda a stack roda em nuvem — o PC pode ficar desligado sem afetar o servico.

| Servico | Host | URL publica |
|---|---|---|
| Backend (agente) | Fly.io (`gru`) | https://nutrichat-backend.fly.dev |
| Painel do nutricionista | Vercel | https://nutrichat-painel.vercel.app |
| Landing page | Vercel | https://nutrichat-landing-six.vercel.app |
| Evolution API v2 (WhatsApp) | Fly.io | https://nutrichat-evolution.fly.dev |
| N8N (crons) | Fly.io | https://nutrichat-n8n.fly.dev |
| Postgres (Evolution v2) | Fly.io | interno |
| Supabase (dados NutriChat) | Supabase Cloud | dashboard |

Passo a passo, env vars por servico e smoke test E2E em [`docs/DEPLOY.md`](docs/DEPLOY.md).

READMEs por sub-projeto:
- [`backend/README.md`](backend/README.md) — endpoints, autenticacao, Fly deploy
- [`nutrichat-painel/README.md`](nutrichat-painel/README.md) — Vite, VITE_* vars, Vercel
- [`../nutrichat-landing/README.md`](../nutrichat-landing/README.md) — Next.js, NEXT_PUBLIC_NUTRI_*, Vercel *(repo separado)*

## Seguranca

- Nunca commite `.env`, `.env.local` nem `.mcp.json`.
- Todos os segredos sao obrigatorios via `.env` — o docker-compose
  falha ao subir se algum estiver faltando.
- Endpoints administrativos exigem `x-internal-key` verificado contra
  `INTERNAL_API_KEY`.
- Webhook da Evolution valida `X-Webhook-Secret` contra
  `EVOLUTION_WEBHOOK_SECRET`.
- Backend usa `helmet` + rate-limit 300 req/min + CORS por allowlist
  (`CORS_ORIGIN`).
- Logs mascaram telefone e nome de paciente (`backend/src/utils/redact.ts`).
