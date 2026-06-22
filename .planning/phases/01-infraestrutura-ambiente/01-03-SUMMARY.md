---
phase: 1
plan: "01-03"
title: "Evolution API + N8N — conexao WhatsApp e webhook"
status: checkpoint-pending
completed_at: "2026-04-22"
duration: "~10 minutos"
tasks_completed: 2
tasks_total: 3
files_created: 3
files_modified: 1
requirements: [INFRA-04, INFRA-05, INFRA-07]
subsystem: whatsapp-integration
tags: [evolution-api, n8n, webhook, whatsapp, pairing-code, cron]
dependency_graph:
  requires:
    - 01-01 (schema Supabase)
    - 01-02 (backend Express + Docker Compose)
  provides:
    - evolution-api-config
    - n8n-workflows-base
    - whatsapp-setup-docs
  affects:
    - Todas as fases seguintes (pipeline WhatsApp -> N8N -> Backend)
tech_stack:
  added:
    - Evolution API (configuracao local)
    - N8N workflows (JSON exportavel)
  patterns:
    - WEBHOOK_GLOBAL_URL para rotear todas as mensagens para o N8N
    - Webhook N8N filtra por event=MESSAGES_UPSERT antes de encaminhar ao backend
    - Cron job com x-internal-token para autenticar chamadas internas (INFRA-07)
key_files:
  created:
    - n8n/workflows/nutrichat-main-webhook.json
    - n8n/workflows/nutrichat-cron-expiracao.json
    - docs/setup-whatsapp.md
  modified:
    - evolution-api/.env (criado a partir de env.example, nao commitado — no gitignore)
decisions:
  - "WEBHOOK_GLOBAL_URL=http://n8n:5678/webhook/evolution — todas as instancias enviam para N8N"
  - "Instancia chamada 'nutrichat' com AUTHENTICATION_API_KEY=nutrichat_local_key em dev"
  - "Cron usa x-internal-token via N8N_INTERNAL_TOKEN env var (implementado na Fase 4)"
  - "evolution-api/.env no gitignore raiz — confirmado via git check-ignore"
metrics:
  duration: "~10 minutos"
  completed: "2026-04-22"
  tasks_completed: 2
  files_created: 3
---

# Phase 1 Plan 03: Evolution API + N8N — conexao WhatsApp e webhook — Summary

**One-liner:** Configuracao da Evolution API com webhook global para N8N e 2 workflows JSON exportaveis (agente principal + cron diario de expiracao de planos).

---

## Status: CHECKPOINT PENDENTE (Task 3)

Tasks 1 e 2 foram concluidas e commitadas. Task 3 requer interacao humana para:
1. Subir os servicos Docker localmente
2. Criar a instancia "nutrichat" na Evolution API via curl
3. Conectar o WhatsApp via Pairing Code
4. Importar os workflows no N8N
5. Verificar o fluxo fim-a-fim

---

## Tasks Concluidas

| Task | Nome | Commit | Arquivos |
|------|------|--------|---------|
| 1 | Configurar Evolution API e exportar workflows N8N base | `2f688ba` | evolution-api/.env, n8n/workflows/*.json, docs/setup-whatsapp.md |
| 2 | Criar instancia + webhook (MANUAL — servicos nao rodando) | `adab672` | — (sem arquivos, passo manual documentado) |

---

## O que foi criado

### evolution-api/.env

Criado a partir de `evolution-api/env.example` com os valores do NutriChat:

| Variavel | Valor |
|----------|-------|
| `SERVER_NAME` | `nutrichat` |
| `DATABASE_CONNECTION_URI` | `postgresql://postgres:postgres@postgres-local:5432/evolution_api` |
| `CACHE_REDIS_URI` | `redis://redis:6379` |
| `AUTHENTICATION_API_KEY` | `nutrichat_local_key` |
| `WEBHOOK_GLOBAL_URL` | `http://n8n:5678/webhook/evolution` |
| `WEBHOOK_GLOBAL_ENABLED` | `true` |
| `WEBHOOK_EVENTS_MESSAGES_UPSERT` | `true` |
| `WEBHOOK_EVENTS_CONNECTION_UPDATE` | `true` |

**Seguranca:** `evolution-api/.env` esta no `.gitignore` raiz — confirmado via `git check-ignore`.

### n8n/workflows/nutrichat-main-webhook.json

Workflow N8N com 4 nodes:
1. **Receber do Evolution API** — Webhook POST `/evolution`
2. **Filtrar — Apenas Mensagens** — IF `event == MESSAGES_UPSERT`
3. **Encaminhar para Backend** — HTTP Request `POST http://backend:3001/api/webhook`
4. **Responder 200 OK** — `{ "status": "received" }`

### n8n/workflows/nutrichat-cron-expiracao.json

Workflow N8N com 2 nodes:
1. **Cron 09h diario** — Schedule Trigger `0 9 * * *`
2. **Chamar Verificacao de Expiracao** — HTTP Request `http://backend:3001/api/expiracao/verificar` com header `x-internal-token`

### docs/setup-whatsapp.md

Guia completo de conexao WhatsApp via Pairing Code, incluindo:
- Passo a passo de criacao de instancia
- Solicitar e inserir o pairing code no WhatsApp
- Configurar webhook para N8N
- Teste final e troubleshooting
- Como re-conectar se a sessao cair
- Instrucoes para producao (Railway)

---

## Task 2: Passos Manuais Pendentes

A Evolution API **nao estava rodando** no momento da execucao (`docker compose ps` retornou vazio). Os seguintes passos devem ser executados manualmente antes ou durante o checkpoint:

### 1. Subir servicos

```bash
cd "C:/Users/botel/OneDrive/Desktop/nutri_fit"
docker compose -f docker-compose.local.yml up -d postgres-local redis evolution-api n8n
# Aguardar ~30s para inicializacao
docker compose -f docker-compose.local.yml ps
```

### 2. Criar instancia nutrichat

```bash
curl -s -X POST http://localhost:8080/instance/create \
  -H "apikey: nutrichat_local_key" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "nutrichat", "token": "", "qrcode": false}'
```

### 3. Registrar webhook

```bash
curl -s -X POST http://localhost:8080/webhook/set/nutrichat \
  -H "apikey: nutrichat_local_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://n8n:5678/webhook/evolution",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }'
```

---

## Checkpoint Task 3 — Instrucoes para o Humano

### Passo 1: Conectar WhatsApp via Pairing Code

Executar (substituir pelo numero dedicado real — D-08):

```bash
curl -X POST http://localhost:8080/instance/connect/nutrichat \
  -H "apikey: nutrichat_local_key" \
  -H "Content-Type: application/json" \
  -d '{"number": "SEU-NUMERO-DEDICADO"}'
```

Resposta: `{ "code": "XXXX-XXXX" }`

No WhatsApp do numero dedicado:
- **Configuracoes > Aparelhos conectados > Conectar com numero de telefone**
- Inserir o codigo retornado

Verificar conexao:
```bash
curl -H "apikey: nutrichat_local_key" \
  http://localhost:8080/instance/connectionState/nutrichat
```
Esperado: `"state": "open"`

### Passo 2: Importar workflows no N8N

1. Abrir http://localhost:5678 no browser
2. Login: `admin` / `nutrichat123`
3. Menu lateral > **Import** > **From file**
4. Importar `n8n/workflows/nutrichat-main-webhook.json`
5. Importar `n8n/workflows/nutrichat-cron-expiracao.json`
6. Ativar ambos os workflows (toggle ON)

### Passo 3: Teste fim-a-fim

Enviar uma mensagem de texto qualquer para o numero conectado pelo WhatsApp pessoal.

Verificar no N8N em http://localhost:5678 > **Executions** se o workflow "NutriChat — Agente Principal" executou.

Esperado: execucao bem-sucedida com status verde.

---

## Deviations from Plan

### Task 2: API calls nao executadas (servicos nao estavam rodando)

- **Found during:** Task 2 — verificacao de estado dos servicos
- **Issue:** `docker compose ps` retornou vazio; `curl localhost:8080/health` falhou com timeout
- **Decisao:** Documentar como passos manuais no SUMMARY e nas instrucoes do checkpoint
- **Impacto:** Zero — o usuario precisaria fazer isso de qualquer forma antes do Pairing Code (Task 3)

---

## Known Stubs

Nenhum stub funcional. Os workflows JSON sao estrutura completa — apenas necessitam ser importados no N8N para ficarem ativos. O campo `N8N_INTERNAL_TOKEN` no cron workflow e uma variavel de ambiente que sera configurada na Fase 4.

---

## Threat Flags

| Mitigacao | Status |
|-----------|--------|
| T-03-02: AUTHENTICATION_API_KEY obrigatoria em todas as requisicoes | Configurada no .env |
| T-03-04: Cron usa x-internal-token (N8N_INTERNAL_TOKEN) | Workflow configurado — backend implementado na Fase 4 |
| T-03-05: evolution-api/.env no gitignore | Confirmado via `git check-ignore` |
| T-03-01: Validacao do header apikey no N8N webhook | Pendente — implementar na Fase 2 |

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| n8n/workflows/nutrichat-main-webhook.json | FOUND |
| n8n/workflows/nutrichat-cron-expiracao.json | FOUND |
| docs/setup-whatsapp.md | FOUND |
| evolution-api/.env (nao commitado) | FOUND localmente, ignorado pelo git |
| Commit 2f688ba (Task 1) | FOUND |
| Commit adab672 (Task 2 — manual) | FOUND |
| evolution-api/.env no gitignore | CONFIRMADO (git check-ignore retornou saida nao vazia) |
