---
phase: 02-core-agente-onboarding-rag
fixed_at: 2026-04-23T00:00:00Z
review_path: .planning/phases/02-core-agente-onboarding-rag/02-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-04-23T00:00:00Z
**Source review:** .planning/phases/02-core-agente-onboarding-rag/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (3 Critical + 5 Warning)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: Partial real API key committed in `.env.example`

**Files modified:** `backend/.env.example`
**Commit:** 9a52597
**Applied fix:** Substituido `sk-proj-...` por `your-openai-api-key-here` — placeholder sintetico sem prefixo de chave real.

---

### CR-02: RLS policy on `dieta_chunks` grants all authenticated users full access to all rows

**Files modified:** `supabase/migrations/20260423000005_dieta_chunks.sql`
**Commit:** 644eecf
**Applied fix:** Removida a policy `authenticated_full_access_dieta_chunks` (USING true para todos). Criadas duas policies especificas: `paciente_read_own_chunks` (SELECT para authenticated usando `paciente_id = auth.uid()`) e `service_write_chunks` (ALL para service_role).

---

### CR-03: Final interview answer (etapa 7) is never merged into persistent state — data loss

**Files modified:** `backend/src/services/agent.ts`
**Commit:** 0c30c0f
**Applied fix:** Substituidas as duas chamadas separadas de `atualizarEstado` por uma unica chamada atomica que persiste `dadosCompletos` (merge de todos os 7 campos) junto com as metricas calculadas (`tmb_kcal`, `tdee_kcal`, `hidratacao_ml`, `creatina_g`) em um unico update com `status: 'completa'`.

---

### WR-01: `/api/boas-vindas/:pacienteId` and `/api/rag/processar` have no authentication

**Files modified:** `backend/src/routes/boas-vindas.ts`, `backend/src/routes/rag.ts`, `backend/src/config/env.ts`, `backend/.env.example`
**Commit:** 96c9a6e
**Applied fix:** Adicionado middleware `requireInternalKey` em ambas as rotas que valida o header `x-internal-key` contra `env.INTERNAL_API_KEY`. Adicionado `INTERNAL_API_KEY` ao `env.ts` (interface, array required e return object) e ao `.env.example` com placeholder descritivo.

---

### WR-02: `match_threshold` default mismatch between SQL function and TypeScript caller

**Files modified:** `supabase/migrations/20260423000005_dieta_chunks.sql`
**Commit:** d042dea
**Applied fix:** Alterado o default da funcao SQL `match_chunks_paciente` de `0.7` para `0.6`, alinhando com o valor passado pelo caller TypeScript em `rag.ts`.

---

### WR-03: `atualizarEstado` silently ignores Supabase update errors

**Files modified:** `backend/src/services/conversation.ts`
**Commit:** f603066
**Applied fix:** O `await supabase.from('pacientes').update(...)` passou a capturar `{ error }` e lanca `new Error(...)` com mensagem descritiva caso o update falhe, garantindo que callers em `agent.ts` sejam notificados de falhas de persistencia.

---

### WR-04: PDF path extraction using string replace is fragile and can silently produce wrong paths

**Files modified:** `backend/src/services/rag.ts`
**Commit:** 43fdae7
**Applied fix:** Substituido o `pdfUrl.replace(/regex/, '')` por validacao explicita com `pdfUrl.startsWith(STORAGE_PREFIX)` seguida de `pdfUrl.slice(STORAGE_PREFIX.length)`. URLs que nao correspondem ao bucket `dietas` agora lancam erro claro antes de tentar o download.

---

### WR-05: `buscarPacientePorWhatsapp` filters by `ativo = true`, hiding inactive patients from error messages

**Files modified:** `backend/src/services/conversation.ts`
**Commit:** 04e89ac
**Applied fix:** Removido o filtro `.eq('ativo', true)` da query em `buscarPacientePorWhatsapp`. Pacientes inativos agora sao retornados pela query e a checagem `if (!paciente.ativo)` em `agent.ts` (linha 123) torna-se alcancavel, enviando a mensagem correta "Seu plano expirou".

---

_Fixed: 2026-04-23T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
