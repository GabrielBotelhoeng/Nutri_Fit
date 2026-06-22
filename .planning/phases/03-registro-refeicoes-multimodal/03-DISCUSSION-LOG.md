# Phase 3: Registro de Refeições Multimodal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 03-registro-refeicoes-multimodal
**Areas discussed:** Fonte de macros (texto/áudio), Distinção de tipo de imagem, Fluxo das 2 fotos para porção, Formato do saldo diário

---

## Fonte de macros (texto e áudio)

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Claude estima direto | Claude usa o conhecimento nutricional do modelo para calcular macros. Simples, zero APIs extras. | ✓ |
| TACO via API | Claude extrai alimentos → busca na Tabela Brasileira de Composição de Alimentos. Mais preciso, mais complexo. | |
| RAG da dieta primeiro, Claude completa | Busca macros no PDF da dieta; se não encontrar, Claude estima. | |

**Escolha do usuário:** Claude estima direto
**Notas:** Precisão aceitável para acompanhamento diário.

---

**Comportamento com alimento incerto:**

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Registra com aviso | Registra e avisa: "⚠️ Estimativa para X — confirme com seu nutricionista". | ✓ |
| Pede confirmação antes | Mostra estimativa e pergunta "Está correto?" antes de registrar. | |

**Escolha do usuário:** Registra com aviso

---

## Distinção de tipo de imagem

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Claude Vision detecta automaticamente | Claude analisa a imagem e decide o fluxo. Fluido para o usuário. | ✓ |
| Paciente informa o tipo | Bot pergunta o tipo antes de processar. | |
| Claude detecta, pede confirmação do tipo | Claude detecta e confirma com o usuário. | |

**Escolha do usuário:** Claude Vision detecta automaticamente

---

## Fluxo das 2 fotos para estimativa de porção

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Bot solicita a segunda foto | Após 1ª foto, bot pede explicitamente a lateral. Usa ambas ou só a 1ª com aviso. | ✓ |
| Sempre processa com 1 foto | Usa só a 1ª foto, sempre com aviso fixo de limitação. | |

**Escolha do usuário:** Bot solicita a segunda foto

---

**Gerenciamento de estado entre as duas fotos:**

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Estado no Supabase com timeout | Salva em `entrevista_dados` JSONB. Timeout 5 min. Reutiliza getEstado/atualizarEstado. | ✓ |
| Janela de tempo por mensagem | Se próxima mensagem for imagem em 3 min, assume que é a 2ª foto. | |

**Escolha do usuário:** Estado no Supabase com timeout

---

## Formato do saldo diário

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Completo com macros | Exibe kcal + proteína + carbo + gordura vs meta. | ✓ |
| Só kcal, resumido | Mensagem curta com só kcal e percentual. | |

**Escolha do usuário:** Completo com macros

---

**Fonte da meta de macros:**

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| TMB/TDEE da entrevista | Usa `tdee_kcal` da Fase 2. Distribuição padrão 30% prot / 40% carbo / 30% gord. | ✓ |
| RAG da dieta | Busca metas de macros no PDF da dieta prescrita. | |

**Escolha do usuário:** TMB/TDEE da entrevista

---

## Claude's Discretion

- Prompt exato para Claude Vision identificar alimentos e estimar macros
- Estratégia de retry para Open Food Facts
- Formato interno do estado temporário das 2 fotos em `entrevista_dados`
- Threshold de confiança para aviso de incerteza

## Deferred Ideas

- Histórico de refeições consultável pelo paciente — Fase 4 ou v2
- Sugestão automática de substituição sem o paciente pedir — pode ser ruidoso
- Integração com balanças inteligentes — out of scope v1
