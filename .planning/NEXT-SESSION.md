# Handoff — Próxima sessão

**Última atualização:** 2026-07-09 (auditoria completa + ativação dos lembretes)

> ⚠️ Regra pra próximo Claude: **NÃO releia arquivos em `.planning/archive/`.** Fases 1–5 estão fechadas, todo o refinamento do agente (P0/P1/P2/SEC) está em `main`. Se precisar entender comportamento antigo, `git log` é a fonte da verdade — não os planos antigos.

## Estado real (2026-07-09, verificado por Grep + git log + SUMMARYs)

| Fase | Status | Notas |
|------|--------|-------|
| 1. Infraestrutura | ✅ Fechada | Arquivada |
| 2. Core agente + RAG | ✅ Fechada | Arquivada |
| 3. Registro multimodal | ✅ Fechada | Arquivada |
| 4. Alertas + expiração + relatório | ✅ Fechada | Arquivada. **Cron alertas ativado em 2026-07-09** (workflow n8n `y0B9QdWn3PMe28kH`) |
| 5. Painel nutricionista | ✅ Fechada | Arquivada |
| 6. Landing page | 🟡 1/3 planos feitos | 06-01 completo (scaffold + hero 3D). Resta 06-02 (conteúdo) e 06-03 (deploy Vercel) |
| 7. Portfólio + deploy | ❌ Não iniciada | Depende de credenciais Railway/Vercel |

**PR #1 já mergeou** (commit `807dce4`). Streaks, P0-2b, timezone, roteamento, memória multi-turn, dedup webhook, todas as correções SEC — tudo em `main`.

**Bugs pós-merge fechados em `main`** (2026-07-08 → 07-09):
- Fase B: registrar múltiplas refeições em uma mensagem (`e9f3cd3`)
- Fase C: ambiguidade de foto — pratos parecidos vs refeições distintas (`46734cf`)
- D-06 Opção C1: Haiku faz merge de correção parcial no card (`130a543`, `532dd7f`)
- Bug 2 Vision: mesa familiar → múltiplos_pratos_parecidos (`dccbf61`)
- Polish descrição pós-divisão por N pessoas (`182cf7e`, `fde93d4`)
- Typo confirmação via Haiku fallback — bug "Aim" (`e37bd75`)

## Lembretes de alimentação/água/suplementos — ATIVOS

Ativados em 2026-07-09:
- **Cron n8n** `NutriChat — Alertas de Refeicao, Agua e Suplementos (Cron 15min)` — id `y0B9QdWn3PMe28kH`, rodando `*/15 * * * *`
- **`alertas_config` do Gabriel** já populada com horários extraídos da dieta (P1-6): café 07:00, lanche 10:00, almoço 12:30, lanche 16:00, jantar 19:30, águas em cada horário. Suplementos vazio.
- **Smoke test:** `POST /api/alertas/disparar {"horario":"12:30"}` → 202 + log `[alertas] Verificando alertas para horario 12:30` ✅

Se algum horário não estiver disparando, verificar em ordem:
1. `docker ps` — n8n up?
2. `curl http://localhost:5678/api/v1/workflows/y0B9QdWn3PMe28kH -H "X-N8N-API-KEY: $N8N_JWT"` → `active: true`?
3. Backend log `docker logs nutrichat_backend --tail 50 | grep alertas`

## O que fazer na próxima sessão

**Ordem recomendada, cada bloco é atômico:**

### Bloco A — UAT dos lembretes (rápido, precisa do usuário)
Confirmar via WhatsApp real que Gabriel recebeu alerta às 07:00 / 10:00 / 12:30 / 16:00 / 19:30. Se recebeu, dar `close` neste item. Se não, seguir o triage acima.

### Bloco B — Fase 6 Plan 02 (landing page — seções de conteúdo)
Plano: `.planning/phases/06-landing-page/06-02-PLAN.md`. Implementa HowItWorks, Features, Testimonials, Plans, Footer no repo `nutrichat-landing` (pasta separada no Desktop, fora do worktree — commits via `--allow-empty` no `nutri_fit`).

### Bloco C — Fase 6 Plan 03 (deploy Vercel)
Plano: `.planning/phases/06-landing-page/06-03-PLAN.md`. Sobe o repo `nutrichat-landing` pra GitHub + configura Vercel. Precisa das credenciais do usuário.

### Bloco D — Fase 7 (portfólio final)
READMEs dos 3 repos + deploy Railway do backend/painel + post LinkedIn. Depende de Vercel do bloco C.

## Bugs abertos (repro pendente)

- **Encoding UTF-8:** `"Água"` chegava como `�\udc81gua` no DB. Sem repro desde 2026-06-24. Reabrir quando o usuário mandar um exemplo real que quebra.

## Comandos úteis

```bash
# Sanity antes de qualquer trabalho
docker ps --format "table {{.Names}}\t{{.Status}}"

# Baseline de testes (backend)
cd backend && npm run test:run && npm run typecheck

# Ver alertas do dia
docker logs nutrichat_backend --tail 200 | grep alertas

# Workflows n8n ativos
curl -s http://localhost:5678/api/v1/workflows -H "X-N8N-API-KEY: $N8N_JWT" | jq '.data[] | {id, name, active}'
```

## Referências (só o essencial)

- `.planning/STATE.md` — estado numérico das fases
- `.planning/ROADMAP.md` — visão de macro
- `.planning/phases/06-landing-page/` — único plano ativo
- `.planning/archive/` — histórico congelado, **não reler**
- Memória: `~/.claude/projects/C--Users-botel-OneDrive-Desktop-nutri-fit/memory/`
