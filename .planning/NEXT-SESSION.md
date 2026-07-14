# Handoff — Próxima sessão

**Última atualização:** 2026-07-14 (testes de `suplementos-llm.ts` — 22 cenários verdes com Claude mockado)

> ⚠️ Regra pra próximo Claude: **NÃO releia arquivos em `.planning/archive/`.** Fases 1–5 estão fechadas, todo o refinamento do agente (P0/P1/P2/SEC) está em `main`. Se precisar entender comportamento antigo, `git log` é a fonte da verdade — não os planos antigos.

## Estado real (2026-07-13, verificado por git log + grep + npm test)

| Fase | Status | Notas |
|------|--------|-------|
| 1. Infraestrutura | ✅ Fechada | Arquivada |
| 2. Core agente + RAG | ✅ Fechada | Arquivada |
| 3. Registro multimodal | ✅ Fechada | Arquivada |
| 4. Alertas + expiração + relatório | ✅ Fechada | Arquivada. Cron alertas ativo (n8n `y0B9QdWn3PMe28kH`). Relatório semanal enriquecido em 2026-07-10 (`b222102`) |
| 5. Painel nutricionista | ✅ Fechada | Arquivada |
| 6. Landing page | 🟡 2/3 planos feitos | 06-01 (scaffold) + 06-02 (white-label parametrizado) completos. Resta 06-03 (deploy Vercel) |
| 7. Portfólio + deploy | ❌ Não iniciada | Depende de credenciais Railway/Vercel |

**Working tree limpo, `main` sincronizado com `origin/main`.** Baseline atual: **465/465 testes verdes (27 arquivos), typecheck limpo.**

**Commits pós-arquivamento das fases 1-5, todos em `main`** (2026-07-08 → 07-13):

| Commit | Data | O quê |
|--------|------|-------|
| `e9f3cd3` | 07-07 | Fase B — múltiplas refeições em uma mensagem |
| `46734cf` | 07-08 | Fase C — ambiguidade de foto (pratos parecidos vs distintos) |
| `130a543`, `532dd7f` | 07-08 | D-06 Opção C1 — Haiku faz merge de correção parcial |
| `dccbf61` | 07-09 | Bug 2 Vision — mesa familiar → múltiplos_pratos_parecidos |
| `182cf7e`, `fde93d4` | 07-09 | Polish descrição pós-divisão por N pessoas |
| `e37bd75` | 07-09 | Typo confirmação via Haiku fallback (bug "Aim") |
| `a6a995b` | 07-09 | Arquiva planos fases 1-5 + ativa cron alertas |
| `86b0317` | 07-10 | **Bloco B2** — refina UX erro/expiração/dica peso típico |
| `a0c6e95` | 07-10 | Entrevista — opções numeradas (sexo/atividade/frequência) |
| `7724906` | 07-13 | Fix Vision — foto de código de barras não registra direto |
| `b222102` | 07-13 | Relatório semanal — gráfico ASCII + alerta de excesso |
| `b0611aa` | 07-13 | **Suplementos** — dose calculada + termogênicos + guard controlados |
| `52bbf68` | 07-14 | **Suplementos LLM** — dose dinâmica via Claude Sonnet + nudge neutro |
| `0252a41` | 07-14 | Handoff — registra suplementos-llm parcial |
| _pendente_ | 07-14 | **suplementos-llm.test.ts** — 22 cenários verdes com Claude mockado |

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

### Blocos A / B / B2 — todos FECHADOS + commitados em `main`

- **A (UAT lembretes):** cron `y0B9QdWn3PMe28kH` batendo 15/15min, jantar+água confirmados no WhatsApp real em 2026-07-09 19:30 BRT.
- **B (landing white-label):** 7 componentes + layout lendo de `lib/nutricionista.ts` com override via `NEXT_PUBLIC_NUTRI_*`. Build verde. Repo `nutrichat-landing` ainda **não empurrado** (aguarda credenciais Vercel).
- **B2 (refinamentos agente):** commitado em `86b0317`. Nudge pós-onboarding + `mensagemErroHumana(err)` + aviso expiração foto/confirmação + dica peso típico. **UAT WhatsApp real ✅ fechado em 2026-07-14** — todos os 8 cenários validados no número real do Gabriel.

### UAT em campo — ✅ TODOS FECHADOS (2026-07-14)

Todos os 8 cenários abaixo foram validados no WhatsApp real do Gabriel (`5562995514963`):

| # | Comportamento validado |
|---|------------------------|
| 1 | ✅ **Nudge pós-onboarding** — msg extra com exemplo chega logo após instruções de uso |
| 2 | ✅ **Msg de erro por causa** — 429/529/503/ETIMEDOUT viram "Meu servidor tá cheio agora. Tenta em 1-2 minutos." |
| 3 | ✅ **Aviso de expiração** — foto ambígua ou card D-06 expira em 10min avisando "sua foto expirou, manda de novo" antes de limpar estado |
| 4 | ✅ **Dica de peso típico** — pergunta "Quantas gramas de banana?" traz "(ex: 1 unidade ~= 120g)" pros 26 alimentos comuns |
| 5 | ✅ **Entrevista numerada** — sexo/atividade/frequência mostram opções `1 X / 2 Y` com rodapé "_Responda com o número._". Aceita número ou texto |
| 6 | ✅ **Barcode não registra direto** — foto de código de barras passa por card D-06 com kcal+P/C/G |
| 7 | ✅ **Suplementos dose calculada** — na etapa 15 com whey/cafeína/ômega, bloco com dose por kg + explicação de termogênicos |
| 8 | ✅ **Guard controlado** — pergunta sobre dose de ostarina/clembuterol redireciona pra endocrinologista com CFN 656/2020, nunca devolve dose |

### Suplementos dose dinâmica via LLM — CÓDIGO + TESTES FECHADOS (UAT pendente)

Novo módulo `backend/src/services/suplementos-llm.ts` chama Claude Sonnet pra dosear qualquer suplemento alimentar (BCAA/glutamina/colágeno/adaptógeno/manipulado por composição), não só os 3 hardcoded. Guard-rails: `analisarSuplementos()` filtra controlados antes, prompt firme, whitelist de categorias + termos suspeitos (ciclo/PCT/ml/semana) + cross-check com `CONTROLADOS`. Fallback pro formatter antigo se LLM falhar.

Nudge pós-onboarding agora é neutro (agent.ts:847) — sem exemplo copiável.

- **Commit inicial** `52bbf68` (2026-07-14) — módulo + wiring no agent.
- **Testes unitários** — `backend/tests/suplementos-llm.test.ts` com Claude mockado via `vi.hoisted`. **22 cenários verdes**, cobrem: lista vazia (short-circuit sem chamar Claude), whitelist com dose (BCAA/adaptogeno), categoria fora da whitelist força precisa_nutri, blacklist (peptideo/hormonio/desconhecido) força sem dose, cross-check de nome controlado (clembuterol/stanozolol) mesmo com categoria "outro_suplemento_alimentar", termos suspeitos (ciclo de / ml/semana / PCT) descartam dose, LLM falha (throw ou JSON inválido) → `falhou: true`, resposta com markdown fence parseia corretamente, sanitização (item sem nome descartado, categoria ausente vira desconhecido), formatter (inclui dose/timing/cautela; linha "Não vou sugerir dose" só quando precisa_nutri).
- **Baseline atual: 465/465 verdes, typecheck limpo.**

**Pendente na próxima sessão:**
1. UAT em campo — reset paciente (`docker exec nutrichat_backend npx tsx src/scripts/reset-gabriel.ts`), refazer onboarding listando `["whey", "creatina", "BCAA", "glutamina", "colageno", "ashwagandha"]`. Verificar que TODOS aparecem com dose apropriada (não só os 3 hardcoded antigos).

### Bloco C — Fase 6 Plan 03 (deploy Vercel) — PENDENTE
Plano: `.planning/phases/06-landing-page/06-03-PLAN.md`. Sobe o repo `nutrichat-landing` pra GitHub + configura Vercel. Precisa das credenciais do usuário.

### Bloco D — Fase 7 (portfólio final) — DEPENDE DE C
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
