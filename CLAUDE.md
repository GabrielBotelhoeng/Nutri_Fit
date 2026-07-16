# NutriChat — Guia rapido para desenvolvedores

Contexto minimo para qualquer IDE agentico ou desenvolvedor humano entender o projeto.

## O que e este projeto

NutriChat e um assistente nutricional entregue via WhatsApp. Fluxo geral:

1. O nutricionista cadastra o paciente pelo painel web.
2. O bot inicia um onboarding automatico (entrevista de 7 etapas).
3. Calcula TMB, meta de hidratacao e dose de suplementos com base na dieta prescrita.
4. Responde duvidas do paciente sobre a dieta usando Claude + RAG (PDF indexado no pgvector).
5. Registra refeicoes por texto, audio, foto do prato ou codigo de barras.
6. Envia alertas nos horarios de refeicao, agua e suplementos.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 18+ / Express / TypeScript (`backend/`) |
| Painel web | React + Vite (`nutrichat-painel/`) |
| Banco / vetor | Supabase (Postgres + pgvector) |
| WhatsApp | Evolution API v2 (Docker) |
| Orquestracao | N8N (Docker) |
| IA | Claude Sonnet 4.6 (Anthropic) + Groq Whisper + OpenAI text-embedding-3-small |

## Setup rapido

```bash
# 1. Copie o exemplo e preencha com suas chaves reais
cp .env.example .env
# edite .env

# 2. Suba a stack local
docker compose -f docker-compose.local.yml up -d

# 3. Verifique containers
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Esperado: `nutrichat_backend`, `nutrichat_evolution`, `nutrichat_n8n`, `nutrichat_redis`, `nutrichat_postgres`.

## Portas locais

| Servico | URL |
|---|---|
| Backend | `http://localhost:3001` (webhook em `/api/webhook`) |
| Evolution API Manager | `http://localhost:8081/manager/` |
| N8N | `http://localhost:5678` |
| Postgres | `localhost:5432` |

## Fluxo de mensagem

```
WhatsApp -> Evolution API -> POST http://backend:3001/api/webhook -> agentService -> Evolution API -> WhatsApp
```

N8N **nao** esta no fluxo de mensagens. N8N so orquestra tarefas periodicas: alertas de refeicao, agua, expiracao de plano e relatorio semanal (via cron -> POST `http://backend:3001/...` com header `x-internal-key`).

## Notas para desenvolvimento

- **Hot reload no Docker (Windows)**: `tsx watch` no container nao detecta mudancas de volume automaticamente. Apos editar arquivos TypeScript no backend, rode `docker restart nutrichat_backend`.
- **Evento Evolution v2**: o webhook usa `messages.upsert` (minusculo), nao `MESSAGES_UPSERT`.
- **Normalizacao de numero BR**: WhatsApp pode enviar com ou sem o "9" adicional (12 vs 13 digitos). Use `normalizarWhatsapp()` em `backend/src/services/conversation.ts`.
- **Testes**: `cd backend && npm test` (Vitest). Typecheck: `npm run typecheck`.

## Estrutura

```
backend/                Express + TypeScript, servico do agente
nutrichat-painel/       Painel React do nutricionista
n8n/workflows/          Definicoes JSON dos crons N8N
supabase/migrations/    Migrations SQL do banco
docker/                 Bootstrap do Postgres local
docker-compose.local.yml   Stack completa para dev
```

## Seguranca

- Nunca commite `.env`, `.env.notes`, `.env.local` ou `.mcp.json`.
- Todos os segredos (`CLAUDE_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_KEY`, etc.) sao obrigatorios via `.env` — o docker-compose falha na hora de subir se algum faltar.
- Endpoints administrativos (crons N8N) exigem header `x-internal-key` verificado contra `INTERNAL_API_KEY`.
- Webhook da Evolution verifica header `X-Webhook-Secret` contra `EVOLUTION_WEBHOOK_SECRET`.
