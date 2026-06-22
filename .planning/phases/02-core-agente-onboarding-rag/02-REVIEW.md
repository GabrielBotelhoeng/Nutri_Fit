---
phase: 02-core-agente-onboarding-rag
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - backend/.env.example
  - backend/package.json
  - backend/src/config/env.ts
  - backend/src/index.ts
  - backend/src/routes/api.ts
  - backend/src/routes/boas-vindas.ts
  - backend/src/routes/rag.ts
  - backend/src/routes/webhook.ts
  - backend/src/services/agent.ts
  - backend/src/services/calculos.ts
  - backend/src/services/conversation.ts
  - backend/src/services/evolution.ts
  - backend/src/services/rag.ts
  - supabase/migrations/20260423000005_dieta_chunks.sql
  - supabase/migrations/20260423000006_paciente_entrevista.sql
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This phase introduced the core agent service (interview flow, RAG pipeline, onboarding), supporting routes, and two database migrations. The overall structure is clear and consistent. Three critical issues were found: a hardcoded partial OpenAI API key in `.env.example`, an overly permissive RLS policy on `dieta_chunks` that gives any authenticated user full read/write access to all patients' diet data, and a data-loss bug in the interview completion path where the final answer from step 7 is never merged into the saved state. Five warnings cover missing auth on the `/api/boas-vindas` and `/api/rag/processar` endpoints, a threshold mismatch between the SQL function default and the TypeScript caller, silent Supabase update failures, and a PDF path extraction approach that can silently produce wrong paths. Four info-level items cover dead code, a missing `lint` script, a `setTimeout` used for UX delay in an async path, and a magic constant.

---

## Critical Issues

### CR-01: Partial real API key committed in `.env.example`

**File:** `backend/.env.example:27`
**Issue:** The `OPENAI_API_KEY` placeholder contains `sk-proj-...` which begins with a real OpenAI key prefix format. While truncated with `...`, committing any fragment of a real key prefix into version control is a security anti-pattern and triggers secret-scanning alerts. If this was copy-pasted from a real key, the actual key may have been present in a prior git state.
**Fix:** Replace with a clearly synthetic placeholder with no key-like prefix:
```
OPENAI_API_KEY=your-openai-api-key-here
```

---

### CR-02: RLS policy on `dieta_chunks` grants all authenticated users full access to all rows

**File:** `supabase/migrations/20260423000005_dieta_chunks.sql:21-24`
**Issue:** The policy `authenticated_full_access_dieta_chunks` uses `USING (true)` and `WITH CHECK (true)` with no row-level filter. Any authenticated Supabase user can read, insert, update, or delete chunks belonging to any patient. Because the backend uses `SUPABASE_SERVICE_KEY` (which bypasses RLS entirely), backend operations are fine — but this exposes patient diet data to any client that holds the `SUPABASE_ANON_KEY` and issues a direct API call.
**Fix:** Restrict reads to the owning patient and writes to the service role only:
```sql
-- Allow patients to read only their own chunks (via anon/authenticated JWT with sub claim)
CREATE POLICY "paciente_read_own_chunks"
  ON dieta_chunks FOR SELECT TO authenticated
  USING (paciente_id = auth.uid());

-- Allow only service role to insert/update/delete
CREATE POLICY "service_write_chunks"
  ON dieta_chunks FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```
If `paciente_id` does not correspond to `auth.uid()`, add a join through the pacientes table using the whatsapp/user mapping instead.

---

### CR-03: Final interview answer (etapa 7) is never merged into persistent state — data loss

**File:** `backend/src/services/agent.ts:160-173`
**Issue:** When the interview reaches the last step (`proximaEtapa > 7`), `dadosCompletos` is assembled by merging `estado.dados` with `novoDado` (line 158). However, the first `atualizarEstado` call on lines 160-164 only saves `novoDado` (the answer to question 7, e.g. `suplementos`) with `status: 'completa'` and `etapa: 7`. The merge result `dadosCompletos` is never persisted in full. The second `atualizarEstado` call on lines 172-179 only saves the computed metrics (`tmb_kcal`, `tdee_kcal`, etc.), not the raw field answers. This means `suplementos` from the final answer will overwrite only the partial data field but the full merged `dadosCompletos` (all seven answers together) is never written atomically. If either update call fails midway, the stored state is inconsistent.

**Fix:** Persist the full merged data and computed metrics in a single update after completing the interview:
```typescript
// After assembling dadosCompletos and computing metrics:
const tmb = calcularTMB(dadosCompletos);
const hidratacao = calcularHidratacao(dadosCompletos.peso_kg);
const creatina = calcularCreatina(dadosCompletos.peso_kg, dadosCompletos.suplementos);

await atualizarEstado(paciente.id, {
  status: 'completa',
  etapa: 7,
  dados: {
    ...dadosCompletos,
    tmb_kcal: tmb.tmb_kcal,
    tdee_kcal: tmb.tdee_kcal,
    hidratacao_ml: hidratacao.meta_ml,
    creatina_g: creatina.dose_g,
  },
});
```
This replaces the two separate `atualizarEstado` calls and ensures the state is written once with all fields.

---

## Warnings

### WR-01: `/api/boas-vindas/:pacienteId` and `/api/rag/processar` have no authentication

**File:** `backend/src/routes/boas-vindas.ts:6` / `backend/src/routes/rag.ts:12`
**Issue:** Both endpoints accept a `pacienteId` or `dieta_id` from the request with no bearer token, API key, or secret validation. Any external actor who discovers the URL can trigger onboarding messages to arbitrary patients or initiate expensive PDF/embedding processing jobs against any `dieta_id`.
**Fix:** Add a shared secret header check (or internal network restriction). For a minimal guard:
```typescript
import { Request, Response, NextFunction } from 'express';

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

boasVindasRouter.post('/:pacienteId', requireInternalKey, async (req, res) => { ... });
```
Add `INTERNAL_API_KEY` to `env.ts` and `.env.example`.

---

### WR-02: `match_threshold` default mismatch between SQL function and TypeScript caller

**File:** `supabase/migrations/20260423000005_dieta_chunks.sql:32` vs `backend/src/services/rag.ts:82`
**Issue:** The SQL function `match_chunks_paciente` declares `match_threshold FLOAT DEFAULT 0.7`, but the TypeScript caller passes `match_threshold: 0.6`. These are inconsistent and the TypeScript value wins at runtime, but any direct SQL usage or tooling that inspects the function signature will expect 0.7. More importantly, 0.6 vs 0.7 is a material difference in retrieval quality. The intended threshold should be agreed upon and unified.
**Fix:** Pick one threshold and apply it consistently. If 0.6 is intentional:
```sql
-- In migration:
match_threshold FLOAT DEFAULT 0.6
```

---

### WR-03: `atualizarEstado` silently ignores Supabase update errors

**File:** `backend/src/services/conversation.ts:90`
**Issue:** The final `supabase.from('pacientes').update(campos).eq('id', pacienteId)` call does not check the returned `error`. If the update fails (network error, constraint violation, wrong `pacienteId`), the function returns `void` silently. Callers in `agent.ts` treat a successful return as confirmation that state was persisted, which is incorrect.
**Fix:**
```typescript
const { error } = await supabase.from('pacientes').update(campos).eq('id', pacienteId);
if (error) {
  throw new Error(`[conversation] Falha ao atualizar estado do paciente ${pacienteId}: ${error.message}`);
}
```

---

### WR-04: PDF path extraction using string replace is fragile and can silently produce wrong paths

**File:** `backend/src/services/rag.ts:27`
**Issue:** The path is derived by stripping a hardcoded URL prefix with a regex replace:
```typescript
const path = pdfUrl.replace(/^.*\/storage\/v1\/object\/public\/dietas\//, '');
```
If `pdfUrl` does not match this pattern (e.g., a signed URL, a different bucket, or an external URL), the regex does not match and `path` will equal the full original `pdfUrl` string. The subsequent `supabase.storage.from('dietas').download(path)` call will then fail with a confusing storage error rather than a clear validation error. There is no check that the URL actually originated from the expected bucket.
**Fix:** Validate the URL before extraction:
```typescript
const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/public/dietas/`;
if (!pdfUrl.startsWith(STORAGE_PREFIX)) {
  throw new Error(`pdfUrl invalida: deve ser do bucket 'dietas'. Recebido: ${pdfUrl}`);
}
const path = pdfUrl.slice(STORAGE_PREFIX.length);
```

---

### WR-05: `buscarPacientePorWhatsapp` filters by `ativo = true`, hiding inactive patients from error messages

**File:** `backend/src/services/conversation.ts:42-44` / `backend/src/services/agent.ts:118-125`
**Issue:** The query in `buscarPacientePorWhatsapp` includes `.eq('ativo', true)` in the WHERE clause. When an inactive patient messages the bot, the query returns `null` and the handler sends "Seu numero nao esta cadastrado" (line 119) instead of the intended "Seu plano expirou" message (line 124). The `paciente.ativo` check on line 123 is unreachable for inactive patients because they are already filtered out at the database level and the function returns `null`.
**Fix:** Remove the `ativo` filter from the query so the patient record is always returned, then rely on the application-level `ativo` check:
```typescript
// In buscarPacientePorWhatsapp — remove .eq('ativo', true)
const { data, error } = await supabase
  .from('pacientes')
  .select('id, nome, whatsapp, ativo, data_expiracao, entrevista_status, entrevista_etapa, entrevista_dados')
  .eq('whatsapp', whatsapp)
  .single();
```

---

## Info

### IN-01: `index.ts` does not register the `ragRouter` — it is only reachable via `apiRouter`

**File:** `backend/src/index.ts:4-15`
**Issue:** `index.ts` imports only `healthRouter` and `apiRouter`. The `ragRouter`, `webhookRouter`, and `boasVindasRouter` are mounted inside `apiRouter` in `routes/api.ts`, which is correct. This is not a bug, but the import list in `index.ts` could mislead readers into thinking those sub-routers need direct registration. No action required unless the architecture changes; just a note for maintainers.

---

### IN-02: No `lint` script in `package.json`

**File:** `backend/package.json:6-11`
**Issue:** `package.json` defines `dev`, `build`, `start`, and `typecheck` scripts but no `lint` script. The project CLAUDE.md instructions (via Synkra AIOX) require `npm run lint` to pass before marking stories complete. Without a lint script, this gate cannot run.
**Fix:** Add ESLint (or similar) and a lint script:
```json
"lint": "eslint src --ext .ts"
```
Add `eslint`, `@typescript-eslint/parser`, and `@typescript-eslint/eslint-plugin` to devDependencies.

---

### IN-03: `setTimeout` for UX delay in a fire-and-forget async path

**File:** `backend/src/services/agent.ts:189`
**Issue:** A 1500ms `setTimeout` is used to simulate "processing" before sending the personalized metrics message. Since `processarMensagem` is called in a fire-and-forget pattern (the webhook returns 200 immediately), the delay is visible only in WhatsApp message ordering. This is a minor UX pattern choice, not a bug, but the delay adds 1.5 seconds of unnecessary latency to what is already an async background operation.
**Fix:** Consider removing the delay, or if ordering guarantees are important, rely on sequential `await sendText` calls (WhatsApp generally delivers messages in send order from the same source).

---

### IN-04: Magic number `7` for total interview steps used in multiple places

**File:** `backend/src/services/agent.ts:156` / `backend/src/services/agent.ts:22-30`
**Issue:** The number `7` (total interview steps) appears as a magic literal in the condition `proximaEtapa > 7` and in the `PERGUNTAS_ENTREVISTA` record keys. If a step is added or removed, both locations must be updated manually and the check on line 156 can easily become stale.
**Fix:** Derive the total from the record itself:
```typescript
const TOTAL_ETAPAS = Object.keys(PERGUNTAS_ENTREVISTA).length; // 7

// Then:
if (proximaEtapa > TOTAL_ETAPAS) { ... }
```

---

_Reviewed: 2026-04-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
