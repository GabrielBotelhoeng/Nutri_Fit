# Phase 3: Registro de Refeições Multimodal - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Paciente consegue registrar qualquer refeição por qualquer mídia (texto, áudio, foto de prato, código de barras, foto de rótulo nutricional) e receber o saldo nutricional do dia após cada registro. Agente sugere substituições de alimentos ausentes usando apenas itens da dieta prescrita.

Esta fase **não** inclui: alertas agendados (Fase 4), painel do nutricionista (Fase 5), landing page (Fase 6). Entrevista inicial e RAG já estão implementados na Fase 2.

</domain>

<decisions>
## Implementation Decisions

### Fonte de Macros (texto e áudio)

- **D-01:** Claude estima os macros diretamente, usando o conhecimento nutricional do modelo. Sem APIs externas de tabela nutricional (TACO etc.). Precisão aceitável para acompanhamento diário (variação de 5-15% é normal em apps profissionais).
- **D-02:** Quando Claude não tem certeza sobre um alimento incomum ou quantidade ambígua, **registra com aviso** em vez de bloquear o fluxo: `⚠️ Estimativa para [alimento] — confirme com seu nutricionista se precisar de precisão.` O registro acontece sem interrupção.

### Distinção de Tipo de Imagem

- **D-03:** Claude Vision **detecta automaticamente** o tipo de foto (prato de comida / código de barras / rótulo nutricional) e entra no fluxo correspondente. Paciente não precisa digitar o tipo — fluxo fluido, zero mensagens extras.

### Fluxo de Estimativa com 2 Fotos (porção)

- **D-04:** Após receber a 1ª foto do prato, o bot **solicita explicitamente a 2ª foto** (ângulo lateral): `📸 Para uma estimativa de porção melhor, mande também uma foto lateral do prato.` Se a 2ª foto chegar, usa ambas; se não chegar dentro do timeout, processa com a 1ª + aviso de limitação.
- **D-05:** Estado entre as duas fotos gerenciado no Supabase via campo `entrevista_dados` (JSONB já existente na tabela `pacientes`). **Timeout de 5 minutos** — se a 2ª foto não chegar, processa com a 1ª e registra. Reutiliza o padrão `getEstado`/`atualizarEstado` já implementado em `conversation.ts`.

### Confirmação antes de Registrar Foto de Prato

- **D-06:** (Decisão prévia do PROJECT.md, mantida) Agente **confirma alimentos identificados** antes de registrar: mostra o que identificou e pede sim/não. Nunca afirma sem 100% de certeza.

### Formato do Saldo Diário

- **D-07:** Saldo exibido **após cada registro**, com kcal + todos os macros vs meta. Formato:
  ```
  ✅ Registrado: [descrição] (X kcal)

  📊 Saldo do dia:
  • Kcal: X / Y kcal
  • Proteína: Xg / Yg
  • Carbo: Xg / Yg
  • Gordura: Xg / Yg
  ```
- **D-08:** Meta de kcal = `tdee_kcal` calculado na Fase 2 (salvo em `entrevista_dados`). Distribuição de macros padrão: 30% proteína, 40% carbo, 30% gordura do TDEE (em gramas calculados de acordo).

### Substituições de Alimentos

- **D-09:** (Decisão prévia do PROJECT.md, mantida) Substituições **apenas da dieta prescrita**. Usar `rag.ts query()` para buscar alternativas no PDF da dieta. Agente só sugere alimentos que aparecem na dieta do paciente — nunca inventa.

### Claude's Discretion

- Prompt exato para Claude Vision identificar alimentos e estimar macros
- Estratégia de retry se Open Food Facts não encontrar o código de barras
- Formato interno do estado temporário das 2 fotos em `entrevista_dados`
- Threshold de confiança do Claude Vision para disparar aviso de incerteza

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da Fase 3
- `.planning/REQUIREMENTS.md` §AGENT — AGENT-02 a AGENT-06, AGENT-13 a AGENT-16 (9 requisitos desta fase)
- `.planning/ROADMAP.md` §Phase 3 — Goal, Success Criteria e Plans desta fase

### Projeto
- `.planning/PROJECT.md` — Stack completa, decisões de arquitetura, paleta de cores

### Código existente a estender/reutilizar
- `backend/src/routes/webhook.ts` — Stubs de `audioMessage` e `imageMessage` a substituir (Fase 3)
- `backend/src/services/agent.ts` — `processarMensagem()` a estender; `responderComClaude()` como padrão de chamada ao Claude
- `backend/src/services/conversation.ts` — `getEstado()`/`atualizarEstado()` a reutilizar para estado das 2 fotos
- `backend/src/services/rag.ts` — `query(pacienteId, pergunta)` a reutilizar para buscar substituições
- `backend/src/services/evolution.ts` — `sendText()` para enviar mensagens

### Schema
- `supabase/migrations/20260422000001_create_schema.sql` — Tabelas `refeicoes` (descricao, kcal, proteina_g, carbo_g, gordura_g, tipo_registro) e `registros_diarios` (kcal_consumido, proteina_g, carbo_g, gordura_g, agua_ml) já existem

### APIs externas
- Open Food Facts: `https://world.openfoodfacts.org/api/v0/product/{barcode}.json` — retorna nutrientes por 100g
- Groq Whisper: via SDK oficial `groq-sdk` (transcrição de áudio)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `conversation.ts` → `getEstado()` / `atualizarEstado()`: padrão para gerenciar estado temporário entre mensagens (ex: aguardando 2ª foto)
- `rag.ts` → `query(pacienteId, pergunta)`: busca chunks da dieta — reutilizar para sugestão de substituições
- `agent.ts` → `responderComClaude()`: padrão de chamada ao Claude com system prompt — reutilizar/adaptar para análise de imagem e cálculo de macros
- `evolution.ts` → `sendText()`: envio de mensagens — já estável, sem alterações

### Established Patterns
- Fire-and-forget no webhook: `res.status(200)` antes de processar (evita timeout)
- Estado do paciente via `entrevista_dados` JSONB em `pacientes` — extensível para novos campos de estado
- Registro de dados: INSERT em `refeicoes` + UPSERT em `registros_diarios` por `(paciente_id, data)`

### Integration Points
- `webhook.ts` `audioMessage` stub → novo `processarAudio(phone, audioUrl)`
- `webhook.ts` `imageMessage` stub → novo `processarImagem(phone, imageUrl, caption?)`
- `agent.ts` `processarMensagem()` → expandir para chamar `processarTextoRefeicao()` quando entrevista está `completa` e mensagem parece registro de refeição
- Tabela `registros_diarios`: UPSERT por `(paciente_id, data)` — já tem `UNIQUE (paciente_id, data)` no schema

</code_context>

<specifics>
## Specific Ideas

- Mensagem de boas-vindas ao modo agente (Fase 2 já envia): *"• 'comi 200g de frango com arroz' — registro por texto\n• 🎤 Áudio descrevendo sua refeição\n• 📸 Foto do prato ou código de barras"* — Fase 3 torna esses fluxos reais
- Aviso de limitação de porção: `⚠️ Estimativa de porção pode variar até 30% — valores são aproximados.`
- Timeout das 2 fotos: salvar em `entrevista_dados` algo como `{ aguardando_foto_2: { imagem_url: "...", timestamp: "..." } }` e verificar na próxima mensagem

</specifics>

<deferred>
## Deferred Ideas

- Reconhecimento de alimentos por nome (sem foto) via imagem gerada — fora do escopo v1
- Histórico de refeições consultável pelo paciente ("o que comi essa semana") — Fase 4 ou v2
- Integração com balanças inteligentes — out of scope v1
- Sugestão automática de substituição sem o paciente pedir — pode ser ruidoso; paciente pede quando quiser

</deferred>

---

*Phase: 03-registro-refeicoes-multimodal*
*Context gathered: 2026-04-24*
