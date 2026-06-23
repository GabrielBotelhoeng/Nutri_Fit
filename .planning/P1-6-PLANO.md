# P1-6 — Extrair horários da dieta antes de perguntar na entrevista

> Plano detalhado para a próxima sessão. Lê primeiro `.planning/REFINAMENTO-AGENTE.md` seção P1-6 pro contexto original. Estado em 2026-06-22 após commit `e819a48` (P0-3).

## Sintoma a corrigir

A entrevista sempre pergunta os horários das refeições (etapa 14), mesmo quando a dieta em PDF já traz horários prescritos. Resultado: ou o paciente repete o que já está no PDF, ou inventa horário diferente da prescrição e o bot grava errado em `alertas_config`.

## Critério de aceite (do REFINAMENTO-AGENTE.md)

- Dieta com **todos os horários** → bot confirma e **pula** a etapa 14: _"Vi na sua dieta que suas refeições são 7h / 12h / 20h, confere?"_
- Dieta com **horários parciais** → bot pergunta só os faltantes.
- Dieta **sem horários** → bot pergunta normalmente (comportamento atual).
- **Nenhum horário inventado** vai para `alertas_config` — o modelo só retorna o que estiver explícito no PDF.

## Stack atual (confirmado por grep antes de fechar a sessão anterior)

- `backend/src/services/rag.ts:19` — `processarDieta(pacienteId, dietaId, pdfUrl)`: chunkeia o PDF e cria embeddings. **Não extrai estrutura.**
- `backend/src/routes/pacientes.ts:100` — `enviarBoasVindas(paciente.id)` chamado **antes** de `processarDieta` (linha 106). Ambos fire-and-forget. **Race condition**: entrevista pode chegar na etapa 14 antes do PDF ter sido processado.
- `backend/src/services/agent.ts:309` — etapa 14: parse texto livre via `parseHorariosRefeicoes`. Grava em `entrevista_dados.horarios_refeicoes` JSONB.
- `backend/src/services/alertas.ts:25-30` — `horarios_refeicoes` keys aceitas: `cafe`, `lanche_manha`, `almoco`, `lanche_tarde`, `jantar`. Sincronizado pra `alertas_config` via `sincronizarAlertasDaEntrevista`.

## Plano de implementação (passos ordenados)

### Passo 1 — Migration Supabase: nova coluna em `dietas`

```sql
alter table public.dietas
  add column if not exists horarios_refeicoes jsonb;

comment on column public.dietas.horarios_refeicoes is
  'P1-6: horarios extraidos do PDF. Schema { cafe, lanche_manha, almoco, lanche_tarde, jantar }, valores string "HHhMM" ou null. Null = nao explicito no PDF.';
```

Onde colocar: criar `backend/migrations/20260623_p1_6_horarios_dieta.sql` (não há diretório de migration ainda — verificar `database/` ou criar novo). Aplicar via dashboard Supabase ou `psql` apontando para `iqpoohthfhmjkvrqxzns`.

### Passo 2 — `rag.ts`: nova função `extrairHorariosDieta`

Adicionar em `backend/src/services/rag.ts`:

```ts
export interface HorariosDieta {
  cafe: string | null;
  lanche_manha: string | null;
  almoco: string | null;
  lanche_tarde: string | null;
  jantar: string | null;
}

export async function extrairHorariosDieta(textoPDF: string): Promise<HorariosDieta>
```

Chamada Claude Haiku 4.5 com prompt rígido:

> Extraia APENAS horários **explicitamente escritos** no PDF. Retorne JSON com chaves cafe/lanche_manha/almoco/lanche_tarde/jantar. Use `null` para refeições sem horário escrito. NÃO infira, NÃO calcule, NÃO arredonde. "Café da manhã às 7h" → `cafe: "7h00"`. "Almoço próximo do meio-dia" → `almoco: null` (não está explícito).

Normalizar saída para formato `"HH:MM"` (ex.: `"7h"` → `"07:00"`, `"7h30"` → `"07:30"`).

### Passo 3 — `routes/pacientes.ts`: inverter ordem e chamar extração

Trocar:
```ts
await enviarBoasVindas(...)            // hoje: 1º
processarDieta(...)                    // hoje: 2º, fire-and-forget
```

Por:
```ts
processarDieta(...)        // dispara chunking RAG em background
extrairHorariosDieta(...)  // bloqueia até retornar — rápido (~2s)
  .then(h => salvar em dietas.horarios_refeicoes)
await enviarBoasVindas(...)            // só depois
```

**Alternativa mais conservadora:** manter `enviarBoasVindas` em paralelo, mas no `agent.ts` etapa 14, checar se `dietas.horarios_refeicoes` já existe; se ainda não, aguardar até 10s antes de fazer a pergunta aberta. Polling simples evita refactor pesado em `routes/pacientes.ts`.

### Passo 4 — `agent.ts`: branch na etapa 14

Antes de enviar `PERGUNTAS_ENTREVISTA[14]`, buscar `dietas.horarios_refeicoes` do paciente:

- **Todos preenchidos** → mensagem de confirmação:
  ```
  Vi na sua dieta os seguintes horários:
  ☕ Café — 7h
  🍽️ Almoço — 12h30
  🌙 Jantar — 20h

  Confere? (sim / não)
  ```
  Se "sim" → grava em `entrevista_dados.horarios_refeicoes` e avança etapa. Se "não" → cai no fluxo de pergunta aberta atual.
- **Parcial** → enumerar os preenchidos + perguntar só os faltantes:
  > "Vi que seu café é 7h e almoço 12h30. Que horas costuma jantar?"
- **Vazio** → comportamento atual (`PERGUNTAS_ENTREVISTA[14]`).

Nova sub-etapa `14a` (confirmação) e `14b` (resposta de "não" cai em pergunta aberta). Ou estado intermediário em `entrevista_dados.confirmacao_horarios_pendente: true`.

### Passo 5 — Testes vitest

- `extrairHorariosDieta` (com mock do Haiku):
  - PDF com 5 horários explícitos → 5 chaves preenchidas.
  - PDF sem horário → 5 chaves `null`.
  - PDF parcial (só café e almoço) → 3 chaves `null`.
  - PDF com "próximo do meio-dia" → `null` (não inferir).
  - Normalização "7h" / "7h30" / "07:30" / "7:30" → `"07:00"` / `"07:30"`.
- `agent.ts` branch da etapa 14:
  - Estado mock com todos horários → mensagem de confirmação, não a aberta.
  - Estado mock com parcial → pergunta só faltantes.
  - "sim" na confirmação → grava `horarios_refeicoes` do PDF, avança.
  - "não" → cai em pergunta aberta.

### Passo 6 — UAT real

Refazer entrevista com 3 pacientes-teste:
1. PDF com horários completos.
2. PDF parcial.
3. PDF sem horários.

Validar que `alertas_config` reflete só horários explícitos do PDF ou da entrevista — nunca inferidos.

## Riscos / decisões abertas

- **Quanto bloqueia o boas-vindas?** Decisão: extração de horários é rápida (~2s), bloquear é OK. Chunking RAG continua em background.
- **Modelo pode "inferir" mesmo com instrução?** Mitigar com `temperature: 0` e exemplos no prompt. Eu confiaria no Haiku 4.5 com prompt rígido; se UAT mostrar inferências indesejadas, adicionar verificação regex contra o texto original do PDF antes de salvar.
- **Schema de `horarios_refeicoes` em `dietas` vs `entrevista_dados`:** dieta = origem; entrevista = confirmado pelo paciente. Manter os dois separados. Só `entrevista_dados.horarios_refeicoes` alimenta `alertas_config`.
- **Backwards-compat:** pacientes já cadastrados sem `dietas.horarios_refeicoes` cobertos pelo fallback "vazio → pergunta atual". Zero migration de dados necessária.

## Arquivos a tocar

```
backend/migrations/20260623_p1_6_horarios_dieta.sql   (novo)
backend/src/services/rag.ts                           (extrairHorariosDieta + chamada)
backend/src/routes/pacientes.ts                       (inverter ordem boas-vindas/extracao)
backend/src/services/agent.ts                         (branch etapa 14 + sub-etapas)
backend/src/services/conversation.ts                  (tipo do estado se precisar)
backend/tests/rag-horarios.test.ts                    (novo)
backend/tests/agent-etapa14.test.ts                   (novo)
```

## Estimativa

- Migration + `extrairHorariosDieta` + testes: **~1h**
- Branch etapa 14 + ordem em `routes/pacientes.ts` + testes: **~1.5h**
- UAT real: **~30min**

Total: **~3h** numa sessão dedicada.

## Onde retomar

Começar lendo `.planning/REFINAMENTO-AGENTE.md` seção P1-6 (linhas 88-98), este plano, e `backend/src/services/rag.ts:19` (`processarDieta`) para entender como o PDF chega no sistema.
