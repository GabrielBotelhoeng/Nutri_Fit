---
phase: 04-alertas-expiracao-relatorio-semanal
plan: "02"
subsystem: alertas-agendados
tags: [alertas, cron, n8n, whatsapp, supabase]
dependency_graph:
  requires: []
  provides: [POST /api/alertas/disparar, dispararAlertas, nutrichat-cron-alertas.json]
  affects: [backend/src/routes/api.ts, alertas_config, n8n workflows]
tech_stack:
  added: []
  patterns: [requireInternalKey middleware, fire-and-forget async, regex input validation]
key_files:
  created:
    - backend/src/services/alertas.ts
    - backend/src/routes/alertas.ts
    - n8n/workflows/nutrichat-cron-alertas.json
    - supabase/migrations/20260425000002_seed_alertas_config.sql
  modified:
    - backend/src/routes/api.ts
decisions:
  - "api.ts nao inclui expiracaoRouter pois esse eh responsabilidade exclusiva do plano 04-01 (paralelo)"
  - "Timezone Brasilia calculada manualmente no Code node N8N (UTC-3) pois Date() retorna UTC"
  - "dispararAlertas usa fire-and-forget: endpoint retorna 202 imediatamente, processamento async"
  - "ON CONFLICT (paciente_id) DO UPDATE na seed migration garante idempotencia"
metrics:
  duration: "3 min"
  completed_date: "2026-04-26"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 4 Plan 02: Alertas de Refeicao, Agua e Suplementos Summary

**One-liner:** Endpoint POST /api/alertas/disparar com validacao regex HH:MM + cron N8N a cada 15 minutos calculando horario Brasilia e disparando alertas por tipo (cafe, almoco, jantar, agua, suplemento).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Service, route e seed migration | a2825b4 | alertas.ts (service + route), api.ts, migration seed |
| 2 | Workflow N8N cron 15min | 0d22313 | nutrichat-cron-alertas.json |

## What Was Built

### backend/src/services/alertas.ts

Funcao `dispararAlertas(horario: string)` que:
1. Busca todas as linhas de `alertas_config` com `ativo=true` fazendo inner join com `pacientes` (apenas pacientes ativos)
2. Para cada config, compara `horario` com todos os campos (horario_cafe, horario_almoco, horario_jantar, horarios_agua[], horario_suplementos[])
3. Envia mensagem WhatsApp via `sendText()` para cada match encontrado
4. Logga quantos alertas foram enviados no total

Mensagens por tipo ja definidas com emojis apropriados.

### backend/src/routes/alertas.ts

`POST /disparar`:
- `requireInternalKey` middleware: rejeita 401 sem header `x-internal-key` correto
- Validacao regex `HORARIO_RE = /^([01]\d|2[0-3]):[0-5]\d$/`: rejeita 400 horarios invalidos (ex: 25:00, abc, 7:30)
- Fire-and-forget: retorna 202 imediatamente, chama `dispararAlertas()` em background

### backend/src/routes/api.ts

Adicionados import e registro: `apiRouter.use('/alertas', alertasRouter)`

### supabase/migrations/20260425000002_seed_alertas_config.sql

INSERT idempotente (`ON CONFLICT (paciente_id) DO UPDATE`) para paciente Gabriel:
- cafe: 07:30, almoco: 12:00, jantar: 19:30
- agua: 09:00, 11:00, 15:00, 17:00 (4x ao dia)
- suplementos: 07:00, 21:00

**IMPORTANTE:** Esta migration precisa ser aplicada manualmente no Supabase Dashboard (SQL Editor) ou via `npx supabase db push` — o CLI nao esta disponivel no ambiente local.

### n8n/workflows/nutrichat-cron-alertas.json

Workflow com 3 nodes:
1. **ScheduleTrigger** — cron `*/15 * * * *` (a cada 15 minutos)
2. **Code node** — calcula horario Brasilia (UTC-3 manual, pois `new Date()` retorna UTC mesmo com GENERIC_TIMEZONE configurado no N8N)
3. **HTTP Request** — POST `http://backend:3001/api/alertas/disparar` com header `x-internal-key` e body `{horario}`

**Para ativar:** Importar em http://localhost:5678 > Settings > Import > Upload JSON

## Verification Results

| Check | Result |
|-------|--------|
| POST sem x-internal-key | 401 Unauthorized |
| POST com horario invalido (25:00) | 400 + mensagem de erro |
| POST com horario valido (03:00) | 202 + `{"status":"processando","horario":"03:00"}` |
| grep alertasRouter em api.ts | Encontrado (import + uso) |
| grep dispararAlertas em alertas.ts | Encontrado |
| grep HORARIO_RE em alertas route | Encontrado |
| grep "*/15" em cron workflow JSON | Encontrado |
| grep x-internal-key em workflow JSON | Encontrado |
| grep api/alertas/disparar em workflow JSON | Encontrado |

## Deviations from Plan

### Desvio de Escopo — api.ts sem expiracaoRouter

**Found during:** Task 1

**Issue:** O plano mostrava o estado "futuro" do api.ts incluindo `expiracaoRouter` (adicionado pelo plano 04-01 paralelo). Como o plano 04-01 executa em paralelo e a instrucao explicita diz "DO NOT modify expiracao-related files", o api.ts foi atualizado apenas com `alertasRouter`, mantendo o comentario para a rota de expiracao.

**Fix:** Adicionado apenas `alertasRouter` ao api.ts atual, sem interferir com 04-01.

**Rule:** N/A — ajuste de escopo conforme instrucao explicita do contexto de execucao.

## Known Stubs

Nenhum stub identificado. A funcao `dispararAlertas` executa logica completa de busca + envio. O endpoint retorna status real (nao mock). A seed migration insere dados reais de teste.

**Nota:** A seed migration ainda precisa ser aplicada manualmente no Supabase Cloud para que o teste com horario 07:30 envie mensagem real ao paciente Gabriel.

## Self-Check: PASSED

- [x] `backend/src/services/alertas.ts` existe e exporta `dispararAlertas`
- [x] `backend/src/routes/alertas.ts` existe e contem `HORARIO_RE`
- [x] `backend/src/routes/api.ts` contem `alertasRouter`
- [x] `supabase/migrations/20260425000002_seed_alertas_config.sql` existe com `INSERT INTO alertas_config`
- [x] `n8n/workflows/nutrichat-cron-alertas.json` existe com cron `*/15`, `x-internal-key` e `api/alertas/disparar`
- [x] Commit a2825b4 existe (Task 1)
- [x] Commit 0d22313 existe (Task 2)
- [x] Endpoint retorna 401, 400, 202 conforme esperado
