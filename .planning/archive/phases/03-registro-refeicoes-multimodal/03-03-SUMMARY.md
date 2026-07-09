---
phase: 3
plan: "03-03"
title: "meal.ts + agent.ts — registro de refeições por texto"
status: complete
completed_at: "2026-04-25T00:00:00Z"
tasks_completed: 2
tasks_total: 2

provides:
  - "meal.ts: processarTextoRefeicao, calcularMacrosComClaude, registrarRefeicao, obterSaldoDia, formatarSaldoDia, sugerirSubstituicao"
  - "agent.ts: detecção de intenção (registro vs consulta vs substituição) no bloco status=completa"

key-files:
  created:
    - backend/src/services/meal.ts
  modified:
    - backend/src/services/agent.ts

decisions:
  - "Detecção de intenção via regex no agent.ts antes de despachar para mealService"
  - "processarTextoRefeicao retorna sem enviar mensagem quando não detecta registro — RAG assume"
  - "sanitizarMacros garante NaN e negativos viram 0 antes do INSERT"
  - "Cast via Parameters<typeof atualizarEstado> para aguardando_foto_2 (campo dinâmico JSONB)"

deviations: []

self-check: PASSED

notes: |
  typecheck passou sem erros.
  meal.ts usa supabase.rpc('acumular_registro_diario') — nunca upsert direto.
  formatarSaldoDia segue exatamente o formato D-07.
  calcularMetas usa distribuição D-08 (30/40/30%).
  sugerirSubstituicao usa ragQuery com prefixo "substituto para" (D-09).
---

## Summary

`meal.ts` criado com 6 funções + `agent.ts` expandido com detecção de intenção.

### O que foi construído

**meal.ts** — núcleo do registro de refeições:
- `calcularMacrosComClaude`: Claude estima kcal/proteína/carbo/gordura a partir do texto
- `registrarRefeicao`: INSERT em `refeicoes` + RPC `acumular_registro_diario` (soma incremental)
- `obterSaldoDia`: SELECT em `registros_diarios` para o dia atual
- `formatarSaldoDia`: formata saldo no padrão D-07 (✅ Registrado / 📊 Saldo do dia)
- `sugerirSubstituicao`: busca na dieta via RAG e sugere alternativas (D-09)
- `processarTextoRefeicao`: ponto de entrada — detecta substituição, registro ou ignora (consulta)

**agent.ts** — expansão do bloco `status === 'completa'`:
- Limpa estado `aguardando_foto_2` expirado (> 5 min) antes de processar
- Detecta intenção via regex (`ehRegistro`, `ehSubstituicao`)
- Despacha para `mealService.processarTextoRefeicao` ou RAG conforme tipo de mensagem
