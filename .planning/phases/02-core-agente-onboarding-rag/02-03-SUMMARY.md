---
phase: 2
plan: "02-03"
title: "Boas-vindas automatica e entrevista inicial"
status: complete
completed_at: "2026-04-23T23:37:17Z"
duration_minutes: 20
tasks_completed: 4
tasks_total: 4

requires:
  - "02-01"
  - "02-02"
provides:
  - "agentService.processarMensagem — nucleo conversacional do NutriChat"
  - "conversationService — persistencia de estado da entrevista no Supabase"
  - "POST /api/boas-vindas/:pacienteId — disparo de onboarding externo"
affects:
  - "backend/src/routes/webhook.ts — substituido stub por agente real"

tech_stack:
  added:
    - "@anthropic-ai/sdk@^0.36.0 — SDK oficial Anthropic para Claude API"
  patterns:
    - "Fire-and-forget em /boas-vindas (202 antes de processar)"
    - "Entrevista sequencial por estado JSONB no Supabase (sem Redis)"
    - "Merge JSONB em atualizarEstado para preservar dados anteriores"

key_files:
  created:
    - supabase/migrations/20260423000006_paciente_entrevista.sql
    - backend/src/services/conversation.ts
    - backend/src/services/agent.ts
    - backend/src/routes/boas-vindas.ts
  modified:
    - backend/src/routes/webhook.ts
    - backend/src/routes/api.ts
    - backend/package.json

decisions:
  - "Estado da entrevista persistido em Supabase (nao Redis) para simplicidade no v1 — Redis pode ser adicionado na Fase 6 se latencia for problema"
  - "Entrevista sequencial fixa com 7 etapas — nao usa LLM para interpretar respostas livres, apenas parsing deterministico para garantir tipos corretos"
  - "enviarBoasVindas cria novo cliente Supabase localmente (nao reutiliza instancia global) para isolamento de chamada unica"
  - "processarMensagem nao lanca excecao em paciente inativo — envia mensagem amigavel e retorna"

requirements_completed:
  - AGENT-08
  - AGENT-09
---

# Phase 2 Plan 03: Boas-vindas automatica e entrevista inicial — Summary

**One-liner:** Nucleo conversacional NutriChat com Claude Sonnet 4.6: onboarding por estado JSONB, entrevista sequencial de 7 etapas e RAG no modo agente.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migration — colunas entrevista na tabela pacientes | df898d2 | `supabase/migrations/20260423000006_paciente_entrevista.sql` |
| 2 | Criar conversationService | 20c44f0 | `backend/src/services/conversation.ts` |
| 3 | Instalar SDK Anthropic e criar agentService | a705f3b | `backend/src/services/agent.ts`, `backend/package.json` |
| 4 | Atualizar webhook e criar rota de boas-vindas | 6e0be0e | `backend/src/routes/webhook.ts`, `backend/src/routes/boas-vindas.ts`, `backend/src/routes/api.ts` |

## What Was Built

### Migration 006 (`20260423000006_paciente_entrevista.sql`)
Adiciona 3 colunas na tabela `pacientes`:
- `entrevista_status TEXT DEFAULT 'pendente'` com CHECK (`pendente | em_andamento | completa`)
- `entrevista_dados JSONB DEFAULT '{}'` para armazenar campos coletados
- `entrevista_etapa INTEGER DEFAULT 0` (0=inicio, 1-6=pergunta ativa, 7=completa)

Aplicado via `npx supabase db push` sem erros.

### conversationService (`backend/src/services/conversation.ts`)
- `buscarPacientePorWhatsapp(whatsapp)` — busca por numero filtrando `ativo=true`
- `getEstado(pacienteId)` — retorna `EstadoEntrevista` com status, etapa e dados JSONB
- `atualizarEstado(pacienteId, update)` — merge JSONB (nao sobrescreve campos anteriores)

### agentService (`backend/src/services/agent.ts`)
Logica principal do agente com 3 fluxos por estado:
1. **pendente** — envia boas-vindas personalizadas com nome do paciente + pergunta 1
2. **em_andamento** — parsing deterministico da resposta, avanca etapa ou repete se invalida
3. **completa** — consulta RAG (`ragService.query`) e responde via Claude Sonnet 4.6

Entrevista coleta: `idade, sexo, peso_kg, altura_cm, atividade_tipo, atividade_frequencia, suplementos`.

`enviarBoasVindas(pacienteId)` — usado pela rota externa para disparar onboarding manual.

### Webhook atualizado (`backend/src/routes/webhook.ts`)
Substituicao do stub `handleText` por `agentService.processarMensagem(phone, text)`.

### Rota de boas-vindas (`backend/src/routes/boas-vindas.ts`)
`POST /api/boas-vindas/:pacienteId` — retorna `202 Accepted` imediatamente e dispara `enviarBoasVindas` em fire-and-forget com log de erro em caso de falha.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Parametros nao utilizados em processarRespostaEntrevista**
- **Found during:** Task 3 — typecheck
- **Issue:** `pacienteId` e `dados` nos params da funcao nao eram usados, causariam erro de lint/typecheck strict
- **Fix:** Prefixado com `_` (`_pacienteId`, `_dados`) para sinalizar intencionalidade
- **Files modified:** `backend/src/services/agent.ts`
- **Commit:** a705f3b

**2. [Rule 1 - Bug] enviarBoasVindas usava dynamic import do supabase-js**
- **Found during:** Task 3 — revisao do plano
- **Issue:** O plano usava `await import('@supabase/supabase-js')` inline que e antipattern e desnecessario (pacote ja importado)
- **Fix:** Substituido por import estatico de `createClient` no topo do arquivo
- **Files modified:** `backend/src/services/agent.ts`
- **Commit:** a705f3b

## Known Stubs

| Stub | File | Razao |
|------|------|-------|
| `audioMessage` retorna mensagem fixа | `backend/src/routes/webhook.ts:49` | Transcricao Groq Whisper implementada na Fase 3 |
| `imageMessage` retorna mensagem fixa | `backend/src/routes/webhook.ts:54` | Claude Vision implementado na Fase 3 |

Stubs nao impedem o objetivo do plano (onboarding + entrevista texto funcional).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: unauthenticated_endpoint | `backend/src/routes/boas-vindas.ts` | POST /api/boas-vindas sem autenticacao — aceito para v1, JWT adicionado na Fase 5 (T-02-03-02) |

## Self-Check: PASSED

- [x] `supabase/migrations/20260423000006_paciente_entrevista.sql` — FOUND
- [x] `backend/src/services/conversation.ts` — FOUND
- [x] `backend/src/services/agent.ts` — FOUND
- [x] `backend/src/routes/boas-vindas.ts` — FOUND
- [x] `backend/src/routes/webhook.ts` — FOUND (modificado)
- [x] `backend/src/routes/api.ts` — FOUND (modificado)
- [x] Commits df898d2, 20c44f0, a705f3b, 6e0be0e — FOUND
- [x] `npm run typecheck` — SEM ERROS
