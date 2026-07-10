# Handoff — Próxima sessão

**Última atualização:** 2026-07-09 (Bloco A + Bloco B fechados — landing white-label pronta pra deploy)

> ⚠️ Regra pra próximo Claude: **NÃO releia arquivos em `.planning/archive/`.** Fases 1–5 estão fechadas, todo o refinamento do agente (P0/P1/P2/SEC) está em `main`. Se precisar entender comportamento antigo, `git log` é a fonte da verdade — não os planos antigos.

## Estado real (2026-07-09, verificado por Grep + git log + SUMMARYs)

| Fase | Status | Notas |
|------|--------|-------|
| 1. Infraestrutura | ✅ Fechada | Arquivada |
| 2. Core agente + RAG | ✅ Fechada | Arquivada |
| 3. Registro multimodal | ✅ Fechada | Arquivada |
| 4. Alertas + expiração + relatório | ✅ Fechada | Arquivada. **Cron alertas ativado em 2026-07-09** (workflow n8n `y0B9QdWn3PMe28kH`) |
| 5. Painel nutricionista | ✅ Fechada | Arquivada |
| 6. Landing page | 🟡 2/3 planos feitos | 06-01 (scaffold) + 06-02 (white-label parametrizado) completos. Resta 06-03 (deploy Vercel) |
| 7. Portfólio + deploy | ❌ Não iniciada | Depende de credenciais Railway/Vercel |

**PR #1 já mergeou** (commit `807dce4`). Streaks, P0-2b, timezone, roteamento, memória multi-turn, dedup webhook, todas as correções SEC — tudo em `main`.

**Bugs pós-merge fechados em `main`** (2026-07-08 → 07-09):
- Fase B: registrar múltiplas refeições em uma mensagem (`e9f3cd3`)
- Fase C: ambiguidade de foto — pratos parecidos vs refeições distintas (`46734cf`)
- D-06 Opção C1: Haiku faz merge de correção parcial no card (`130a543`, `532dd7f`)
- Bug 2 Vision: mesa familiar → múltiplos_pratos_parecidos (`dccbf61`)
- Polish descrição pós-divisão por N pessoas (`182cf7e`, `fde93d4`)
- Typo confirmação via Haiku fallback — bug "Aim" (`e37bd75`)

## Lembretes de alimentação/água/suplementos — ATIVOS + UAT ✅

Ativados em 2026-07-09, **UAT confirmado em 2026-07-09 19:30 BRT**:
- **Cron n8n** `NutriChat — Alertas de Refeicao, Agua e Suplementos (Cron 15min)` — id `y0B9QdWn3PMe28kH`, `active=t`, rodando `*/15 * * * *`
- **`alertas_config` do Gabriel** populada com horários da dieta (P1-6): café 07:00, lanche 10:00, almoço 12:30, lanche 16:00, jantar 19:30, águas em cada horário. Suplementos vazio.
- **UAT WhatsApp real** — tick 19:30 disparou jantar + água (630ml) e ambas chegaram no WhatsApp do Gabriel. Log: `[alertas] jantar enviado` + `[alertas] agua (630ml) enviado` (22:30 UTC). ✅
- **Tick 19:15** rodou como no-op (0 alertas) — evidência de que o cron está batendo a cada 15min.

Fluxo de população dos horários (3 vias, prioridade nessa ordem):
1. **PDF da dieta** → `extrairHorariosDaDieta()` na indexação → etapa 14 apresenta pré-preenchido com Sim/Não/Parcial.
2. **Paciente digita na entrevista** (fallback quando PDF não traz).
3. **Nutricionista via painel/BD** — sync não apaga config existente (trava de segurança).

Se algum horário não estiver disparando, verificar em ordem:
1. `docker ps` — n8n up?
2. `docker exec nutrichat_postgres psql -U postgres -d n8n -tAc "SELECT active FROM workflow_entity WHERE id='y0B9QdWn3PMe28kH';"` → `t`?
3. Backend log `docker logs nutrichat_backend --tail 50 | grep alertas`

## O que fazer na próxima sessão

**Ordem recomendada, cada bloco é atômico:**

### Bloco A — UAT dos lembretes ✅ FECHADO (2026-07-09 19:30 BRT)
Gabriel recebeu no WhatsApp real o jantar + água do tick 19:30. Cron n8n confirmado batendo a cada 15min (tick 19:15 no-op + tick 19:30 disparou). Ver seção "Lembretes de alimentação/água/suplementos" acima pra detalhes.

### Bloco B — Landing: parametrizar dados do nutricionista ✅ FECHADO (2026-07-09)

Refactor tipo A completo. Todos os 7 arquivos com hardcode "Camila Rocha / CRN-3 12.345 / Nutri Camila" agora leem de `lib/nutricionista.ts`, que expõe 11 campos com override via `NEXT_PUBLIC_NUTRI_*` (incluindo concordância de gênero: `artigo`, `pronome`, `registrado`). `.env.example` documenta as vars. `npm run build` verde (compile 7.5s, TS 10.1s, 4 páginas prerender). Grep de `Camila|CRN-3 12.345|Nutri Camila` só sobra dentro do próprio `lib/nutricionista.ts` (fallbacks — esperado).

Detalhes completos: `.planning/phases/06-landing-page/06-02-SUMMARY.md` (inclui rationale da mudança de escopo pra single-tenant white-label).

**Estado do repo `nutrichat-landing`:** ainda com commits não empurrados. `git status` mostra `.env.example`, `lib/nutricionista.ts`, `06-02-SUMMARY.md`, `Hero.tsx`, `Header.tsx`, `Footer.tsx`, `StatsSection.tsx`, `Testimonials.tsx`, `PhoneCanvas.tsx`, `app/layout.tsx` — 10 arquivos alterados/criados. Ainda não commitado (@devops decide o momento).

### Bloco B2 — Refinamentos do agente ✅ FECHADO (2026-07-09)

Auditoria + 3/4 refinamentos aplicados (#4 descartado por análise). Suite 364/364 verdes, typecheck limpo, backend restarted. Diff: `agent.ts` +17, `meal.ts` +80/-6. **Ainda não commitado — @devops decide o momento.**

- **✅ #1 Nudge de ativação pós-onboarding** — `agent.ts:794-803`. sendText extra com exemplo "tomei 1 copo de café com leite e um pão com manteiga" após instrucoes_de_uso.
- **✅ #3 `mensagemErroHumana(err)`** — `meal.ts:29-42` (novo helper) + 4 call sites (`processarTextoRefeicao`, `processarRespostaQuantidade`, `processarRespostaPreparo`, `processarTextoCorrecao`). Sobrecarga (429/529/503/ETIMEDOUT/…) → "Meu servidor tá cheio agora. Tenta em 1-2 minutos." Resto mantém MSG_ERRO_HUMANA original (30s).
- **✅ #5 Aviso ao expirar foto/confirmacao pendente** — `agent.ts` blocos `fotoAmbiguaPendente` e `confirmacaoPendente`. sendText de expiração antes de `atualizarEstado`; `// Nao retornar` preservado.
- **✅ #2 Dica de peso típico** — `meal.ts:44-88` (novo dict `PESOS_TIPICOS` + helpers `semAcento` + `dicaPesoTipico`). 26 alimentos comuns (banana, arroz, pão, ovo, frango, batata, …). Injetado nas 2 perguntas "Quantas gramas de *X*". `contains` sem acento → "Batata frita" bate com "batata". Teste `preparo.test.ts:331` (`toContain`) preservado.
- **❌ #4 Validação stricta de macros** — descartado (racional no handoff antigo).

**Verificação pós-fix:** `npm run test:run` 364/364, `npm run typecheck` limpo, `docker restart nutrichat_backend` OK. UAT WhatsApp real ainda não feito — próximo Claude pode validar em campo se convier ou seguir pro Bloco C direto.

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
