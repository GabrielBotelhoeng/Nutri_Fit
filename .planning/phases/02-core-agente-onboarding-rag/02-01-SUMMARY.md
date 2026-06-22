---
phase: 02-core-agente-onboarding-rag
plan: "02-01"
subsystem: api
tags: [express, webhook, evolution-api, whatsapp, typescript, routing]

requires:
  - phase: 01-infraestrutura-ambiente
    provides: "backend Express + Docker Compose + Evolution API configurada"

provides:
  - "POST /api/webhook com routing por messageType (conversation, audio, imagem)"
  - "EvolutionService.sendText() para envio de mensagens via Evolution API"
  - "Router central /api para agregacao de subrotas"

affects:
  - 02-02 (RAG service usara apiRouter para registrar /rag)
  - 02-03 (handleText stub sera substituido pelo agente Claude)
  - Fase 3 (stubs de audio e imagem serao substituidos por transcricao e visao)

tech-stack:
  added: []
  patterns:
    - "Fire-and-forget: resposta 200 antes de processar para nao dar timeout no N8N"
    - "Switch por messageType para routing de tipos de midia"
    - "Router central /api agregando subrotas por dominio"
    - "fetch nativo Node.js 20 para chamadas REST (sem node-fetch)"

key-files:
  created:
    - backend/src/services/evolution.ts
    - backend/src/routes/webhook.ts
    - backend/src/routes/api.ts
  modified:
    - backend/src/index.ts

key-decisions:
  - "Fire-and-forget no webhook: res.status(200) antes de processar impede timeout no N8N"
  - "handleText como stub confirmativo em 02-01 — sera substituido pelo agente Claude em 02-03"
  - "Stubs de audio/imagem retornam mensagem amigavel — historicamente correto para versao alpha"
  - "INSTANCE hardcoded como 'nutrichat' no EvolutionService — consistente com configuracao do 01-03"

patterns-established:
  - "Router por dominio: cada funcionalidade tem seu proprio arquivo em src/routes/"
  - "Service por integracao externa: cada API externa tem seu service em src/services/"
  - "Logs mostram apenas numero e tipo de mensagem — nunca conteudo (privacidade)"

requirements-completed: [AGENT-01]

duration: 8min
completed: "2026-04-23"
---

# Phase 2 Plan 01: Webhook Routing por Tipo de Midia — Summary

**Pipeline WhatsApp funcional: Evolution API -> N8N -> POST /api/webhook com routing por messageType e EvolutionService.sendText() para respostas.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-23T00:00:30Z
- **Completed:** 2026-04-23T00:08:30Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- EvolutionService criado com sendText() usando fetch nativo Node.js 20 — sem dependencias extras
- Webhook router com fire-and-forget (200 antes de processar) e routing por messageType
- Router central /api registrado no Express, com estrutura extensivel para planos seguintes

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Criar EvolutionService** - `800a8a8` (feat)
2. **Task 2: Criar webhook router com routing por tipo de midia** - `6fe2851` (feat)
3. **Task 3: Criar router central /api e registrar no Express** - `cd4f4df` (feat)

## Files Created/Modified

- `backend/src/services/evolution.ts` — Cliente REST para Evolution API com sendText()
- `backend/src/routes/webhook.ts` — POST /api/webhook com routing por messageType e filtros
- `backend/src/routes/api.ts` — Router central /api agregando subrotas
- `backend/src/index.ts` — Adicionado import e registro de apiRouter

## Decisions Made

- Fire-and-forget: `res.status(200)` antes do `switch` impede que o N8N aguarde o processamento e dê timeout. Padrao critico para integracao estavel.
- handleText implementado como stub confirmativo — envia `Recebi: "..."` ao usuario. Sera substituido pelo agente Claude completo em 02-03.
- Stubs para audio e imagem enviam mensagem amigavel ao usuario para comunicar que o recurso esta em configuracao.
- INSTANCE fixo como 'nutrichat' no EvolutionService — consistente com a instancia criada no plano 01-03.

## Deviations from Plan

Nenhuma — plano executado exatamente como especificado. TypeScript typecheck passou sem erros.

## Issues Encountered

Nenhum.

## Known Stubs

| Stub | Arquivo | Linha | Razao |
|------|---------|-------|-------|
| handleText — resposta confirmativa | backend/src/routes/webhook.ts | ~65 | Sera substituido pelo agente Claude em 02-03 |
| audioMessage handler | backend/src/routes/webhook.ts | ~47 | Sera substituido por transcricao Groq Whisper na Fase 3 |
| imageMessage handler | backend/src/routes/webhook.ts | ~52 | Sera substituido por Claude Vision na Fase 3 |

Os stubs nao impedem o objetivo do plano (routing funcional e envio de mensagens). O fluxo N8N -> backend esta completo e testavel.

## Threat Flags

Nenhuma nova superficie de seguranca alem do que ja estava no threat_model do plano.

Mitigacoes implementadas:
- T-02-01-02 (DoS): Resposta 200 imediata implementada — processamento nao bloqueia N8N
- T-02-01-03 (Info Disclosure): Logs mostram apenas numero e tipo — nunca conteudo da mensagem

## Next Phase Readiness

- POST /api/webhook funcional e pronto para receber mensagens do N8N
- apiRouter extensivel — 02-02 pode adicionar `/api/rag` sem tocar em index.ts
- EvolutionService reutilizavel por todos os planos seguintes que precisem enviar mensagens
- Stubs de audio/imagem comunicam estado alpha ao usuario de forma amigavel

---
*Phase: 02-core-agente-onboarding-rag*
*Completed: 2026-04-23*
