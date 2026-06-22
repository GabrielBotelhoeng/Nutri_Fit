---
phase: 5
slug: painel-do-nutricionista
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Nenhum (sem jest/vitest configurado no backend atual) — testes são smoke/manual |
| **Config file** | Não existe — Wave 0 não instala framework (escopo fora desta fase) |
| **Quick run command** | `npm run typecheck` (backend) |
| **Full suite command** | smoke test manual: `curl` nas 3 rotas + browser login |
| **Estimated runtime** | ~30 segundos (typecheck) + ~5 min (smoke manual) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Smoke test manual (curl + browser)
- **Before `/gsd-verify-work`:** Todos os 5 success criteria do ROADMAP.md verificados
- **Max feedback latency:** 30 segundos (typecheck)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | AUTH-01 | T-5-01 | Login retorna sessão Supabase válida | smoke manual | — | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | AUTH-02 | T-5-02 | Sessão persiste após reload (localStorage) | smoke manual | — | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | AUTH-03 | T-5-03 | Sem signUp exposto — apenas signInWithPassword | typecheck | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | PANEL-01 | T-5-04 | POST /api/pacientes sem X-API-Key retorna 401 | curl smoke | `curl -X POST http://localhost:3001/api/pacientes` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | PANEL-01 | T-5-04 | POST com campos válidos + PDF retorna 201 | curl smoke | `curl -X POST -H "X-API-Key:..." -F "dieta=@test.pdf" ...` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 1 | PANEL-02 | — | Upload PDF aparece no Supabase Storage bucket `dietas` | smoke manual | — | — | ⬜ pending |
| 05-02-04 | 02 | 1 | PANEL-03 | — | Boas-vindas disparadas após cadastro | smoke manual (WhatsApp) | — | — | ⬜ pending |
| 05-02-05 | 02 | 2 | PANEL-04 | — | GET /api/pacientes retorna campo `status` ativo/expirando/expirado | curl smoke | `curl -H "X-API-Key:..." http://localhost:3001/api/pacientes` | ❌ W0 | ⬜ pending |
| 05-02-06 | 02 | 2 | PANEL-05 | — | PATCH /api/pacientes/:id com `ativo: false` | curl smoke | `curl -X PATCH -H "X-API-Key:..." -d '{"ativo":false}'` | ❌ W0 | ⬜ pending |
| 05-02-07 | 02 | 2 | PANEL-06 | — | PATCH /api/pacientes/:id com nova `data_expiracao` | curl smoke | `curl -X PATCH -H "X-API-Key:..." -d '{"data_expiracao":"2026-12-01"}'` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 3 | AUTH-01/02/03 | T-5-01 | Login funcional no browser — sessão persiste | smoke manual | — | — | ⬜ pending |
| 05-03-02 | 03 | 3 | PANEL-04 | — | Lista de pacientes exibe badges corretos (verde/amarelo/vermelho) | smoke manual (browser) | — | — | ⬜ pending |
| 05-03-03 | 03 | 3 | PANEL-01/05/06 | — | Modal de cadastro e edição funcionam | smoke manual (browser) | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/config/env.ts` — adicionar `PANEL_API_KEY` ao tipo `Env` e array `required`
- [ ] `backend/src/routes/api.ts` — registrar `pacientesRouter` em `/api/pacientes`
- [ ] `backend/src/services/rag.ts` — corrigir `STORAGE_PREFIX` (remover `/public/` do path)
- [ ] `.env` (backend) — adicionar `PANEL_API_KEY=<chave-gerada>`

*Sem framework de testes instalado — verificação desta fase é smoke/manual + typecheck.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login com email/senha no browser | AUTH-01 | Supabase Auth SDK no browser | Abrir `localhost:5173`, inserir credenciais, verificar redirecionamento para Dashboard |
| Sessão persiste após reload | AUTH-02 | Requer browser com localStorage | Após login, fechar aba, reabrir — painel deve carregar sem pedir login novamente |
| Sem acesso sem login | AUTH-03 | Comportamento client-side | Abrir `localhost:5173` sem estar logado — deve exibir tela de login |
| Boas-vindas WhatsApp disparadas | PANEL-03 | Requer WhatsApp real conectado | Cadastrar paciente de teste, verificar se mensagem de boas-vindas chega no WhatsApp |
| Upload PDF → Storage | PANEL-02 | Requer Supabase dashboard | Após cadastro, verificar no Supabase Storage bucket `dietas` se arquivo aparece |
| Badges visuais corretos | PANEL-04 | UI visual | Criar pacientes com datas variadas e verificar cores dos badges no browser |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (typecheck)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
