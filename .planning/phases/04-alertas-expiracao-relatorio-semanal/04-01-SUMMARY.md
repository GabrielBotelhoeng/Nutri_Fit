---
phase: 4
plan: "04-01"
title: "Expiração — endpoint + agent.ts inline warning"
status: complete
completed_at: "2026-04-25T00:00:00Z"
tasks_completed: 2
tasks_total: 2

provides:
  - "expiracao.ts: verificarExpiracoes() — bloqueia vencidos (ativo=false) + avisa expirando em 1-3 dias"
  - "routes/expiracao.ts: POST /api/expiracao/verificar com requireInternalKey"
  - "agent.ts: aviso reativo inline quando diasParaVencer <= 3"
  - "api.ts: rota /expiracao registrada"
  - "alertas.ts: fix typecheck (as unknown as)"

key-files:
  created:
    - backend/src/services/expiracao.ts
    - backend/src/routes/expiracao.ts
  modified:
    - backend/src/routes/api.ts
    - backend/src/services/agent.ts
    - backend/src/services/alertas.ts

decisions:
  - "Workflow N8N já estava correto (x-internal-key + valor hardcoded) — Task 1 era no-op"
  - "docker-compose já tinha N8N_INTERNAL_TOKEN — no-op"
  - "Fix typecheck: config.pacientes precisava de cast via unknown"

deviations: []
self-check: PASSED

verified:
  - "POST /api/expiracao/verificar com x-internal-key → 202 ✅"
  - "POST /api/expiracao/verificar sem header → 401 ✅"
  - "tsc --noEmit sem erros ✅"
---

## Summary

Endpoint `POST /api/expiracao/verificar` criado e funcionando. `agent.ts` envia aviso inline quando plano vence em ≤ 3 dias sem bloquear o fluxo normal.
