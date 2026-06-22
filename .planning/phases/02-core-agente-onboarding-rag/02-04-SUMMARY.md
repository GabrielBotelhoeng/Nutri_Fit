---
phase: 2
plan: "02-04"
title: "Calculos de TMB, hidratacao e creatina"
status: complete
completed_at: "2026-04-23T23:40:28Z"
duration_minutes: 2
tasks_completed: 2
tasks_total: 2

requires:
  - "02-03"
provides:
  - "calculos.ts — funcoes puras de calculo nutricional (TMB, hidratacao, creatina)"
  - "agentService — envia numeros personalizados automaticamente apos entrevista completa"
affects:
  - "backend/src/services/agent.ts — bloco de conclusao da entrevista expandido"
  - "backend/src/services/conversation.ts — EstadoEntrevista.dados estendido"

tech_stack:
  added: []
  patterns:
    - "Funcoes puras sem I/O para logica de calculo (testavel isoladamente)"
    - "Merge de estado JSONB para salvar calculos junto aos dados da entrevista"
    - "setTimeout delay de 1500ms para UX de 'calculando...' antes de enviar resultados"

key_files:
  created:
    - backend/src/services/calculos.ts
  modified:
    - backend/src/services/agent.ts
    - backend/src/services/conversation.ts

decisions:
  - "calculos.ts como modulo separado de funcoes puras — testavel sem mocks de banco/HTTP"
  - "Deteccao de nivel de atividade por texto livre com fallback para 'Moderadamente ativo' (1.55)"
  - "calcularCreatina respeita dose prescrita pelo nutricionista se padrao 'creatina Xg' encontrado"
  - "Resultados salvos em entrevista_dados para nao recalcular a cada mensagem futura"
  - "conversation.ts estendido com campos opcionais tmb_kcal/tdee_kcal/hidratacao_ml/creatina_g"

requirements_completed:
  - AGENT-10
  - AGENT-11
  - AGENT-12
---

# Phase 2 Plan 04: Calculos de TMB, hidratacao e creatina — Summary

**One-liner:** Calculo Mifflin-St Jeor com deteccao de atividade por texto livre, hidratacao 35ml/kg e creatina 0.03g/kg — enviados automaticamente pelo agente apos a 7a etapa da entrevista.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar calculosService com funcoes puras | dd90054 | `backend/src/services/calculos.ts` |
| 2 | Integrar calculos no agentService | 3a1eb2c | `backend/src/services/agent.ts`, `backend/src/services/conversation.ts` |

## What Was Built

### calculosService (`backend/src/services/calculos.ts`)

Modulo de funcoes puras sem efeitos colaterais:

- **`calcularTMB(dados)`** — Formula Mifflin-St Jeor. Masculino: `10*peso + 6.25*altura - 5*idade + 5`. Feminino: `10*peso + 6.25*altura - 5*idade - 161`. Detecta nivel de atividade por texto livre (5 niveis: 1.2 a 1.9). Retorna `tmb_kcal`, `tdee_kcal`, `fator_atividade`, `nivel_atividade`.

- **`calcularHidratacao(peso_kg)`** — Meta de `peso * 35` ml, distribuida em 8 porcoes ao longo do dia com horarios sugeridos (acordar, cafe, manha, almoco, tarde, jantar, noite, dormir).

- **`calcularCreatina(peso_kg, suplementos?)`** — Se suplementos contem padrao `creatina Xg`, retorna dose do nutricionista (fonte: `nutricionista`). Caso contrario, calcula `0.03g/kg` arredondado (fonte: `calculada`).

- **`formatarMensagemCalculos(tmb, hidratacao, creatina)`** — Mensagem formatada para WhatsApp com emojis, exibindo TMB, TDEE, nivel de atividade, meta de hidratacao e dose de creatina.

### agentService atualizado (`backend/src/services/agent.ts`)

Bloco `if (proximaEtapa > 7)` expandido:
1. Merge `estado.dados + novoDado` para obter `DadosEntrevista` completo
2. Calcula TMB, hidratacao e creatina
3. Salva `tmb_kcal`, `tdee_kcal`, `hidratacao_ml`, `creatina_g` em `entrevista_dados` via `atualizarEstado`
4. Envia 3 mensagens ao paciente: confirmacao de conclusao, calculos personalizados formatados, instrucoes de uso do NutriChat

### conversation.ts estendido

`EstadoEntrevista.dados` recebeu 4 campos opcionais: `tmb_kcal`, `tdee_kcal`, `hidratacao_ml`, `creatina_g` — para tipagem correta do merge e salvamento.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Estender EstadoEntrevista.dados em conversation.ts**
- **Found during:** Task 2 — ao tentar passar dados calculados para `atualizarEstado`
- **Issue:** O tipo `EstadoEntrevista.dados` nao incluia os campos de resultado de calculos, o que causaria erro de tipo ao salvar `tmb_kcal` etc.
- **Fix:** Adicionados 4 campos opcionais ao tipo `EstadoEntrevista.dados`
- **Files modified:** `backend/src/services/conversation.ts`
- **Commit:** 3a1eb2c

## Known Stubs

Nenhum stub neste plano. Calculos sao totalmente funcionais e enviados automaticamente.

## Threat Flags

Nenhuma nova superficie de seguranca introduzida. Conforme threat model do plano: funcoes puras sem I/O externo, dados pessoais (peso, altura) usados apenas no backend e enviados ao proprio paciente.

## Self-Check: PASSED

- [x] `backend/src/services/calculos.ts` — FOUND
- [x] `calcularTMB` em calculos.ts — FOUND
- [x] `calcularHidratacao` em calculos.ts — FOUND
- [x] `calcularCreatina` em calculos.ts — FOUND
- [x] `formatarMensagemCalculos` em calculos.ts — FOUND
- [x] `calcularTMB` em agent.ts — FOUND
- [x] `formatarMensagemCalculos` em agent.ts — FOUND
- [x] `tmb_kcal` salvo em agent.ts — FOUND
- [x] `hidratacao_ml` salvo em agent.ts — FOUND
- [x] Commits dd90054, 3a1eb2c — FOUND
- [x] `npm run typecheck` — SEM ERROS
