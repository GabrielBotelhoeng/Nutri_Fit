# Peso + lembretes inteligentes — design

**Data:** 2026-11-09
**Branch:** `feat/peso-lembretes-inteligentes` (base: `fix/alertas-janela-15min`, PR #5)
**Status:** aprovado em conversa, aguardando revisão da spec

## Objetivo

Aumentar a adesão do paciente entre consultas com duas mudanças de baixo custo:

1. **Registro de peso** — o paciente manda o peso pelo WhatsApp e vê a evolução.
2. **Lembretes inteligentes** — os alertas param de disparar quando não fazem sentido e o
   paciente inativo recebe uma mensagem de reengajamento em vez de spam.

Motivação: adesão é o KPI do nutricionista; lembretes que reagem ao comportamento
(cobrar só o que falta, reengajar quem sumiu) aumentam o registro de refeições, e
continuar registrando é o maior preditor de retenção.

## Fora de escopo

- Gráfico de peso / painel de adesão no painel web (próxima entrega, vai ler estas tabelas).
- Recalcular TMB/metas automaticamente quando o peso muda (decisão clínica do nutricionista).
- Cron novo de pesagem (o convite vai no relatório semanal).
- Deploy (bloqueado até a migração Fly → Oracle).

## Parte A — Registro de peso

### Dados

Migration nova `supabase/migrations/20261109000001_pesagens_e_reengajamento.sql`:

```sql
CREATE TABLE IF NOT EXISTS pesagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  peso_kg NUMERIC(5,2) NOT NULL CHECK (peso_kg BETWEEN 30 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (paciente_id, data)
);
CREATE INDEX IF NOT EXISTS idx_pesagens_paciente_data ON pesagens(paciente_id, data DESC);
ALTER TABLE pesagens ENABLE ROW LEVEL SECURITY;  -- mesmo padrão de sec_3: só service role
```

- Uma pesagem por dia; reenviar no mesmo dia faz upsert (é a forma de corrigir).
- A `data` usa o dia em America/Sao_Paulo, igual a `registros_diarios`.
- Peso inicial de referência = `entrevista_dados.peso_kg` (não é copiado para a tabela).

### Intent `peso`

- `Intent` ganha `'peso'`. Detecção **só por fast-path** em `classificarIntencaoRapida`,
  avaliada antes de `registrar`/`agua`. Nunca vem do Haiku (o prompt do Haiku não muda).
- Casa quando há marcador de pesagem **e** um número:
  - "pesei 78,4" / "me pesei hoje: 79kg" / "meu peso hoje é 79" / "peso 80,2"
  - "tô com 80kg na balança" / "balança marcou 77,9"
- **Não** casa: "comi 1kg de melancia", "quanto eu devo pesar?", "quero perder peso",
  "posso comer pão? estou acima do peso" (pergunta → consulta segue o fluxo atual).
  Regra: pergunta (`?`) nunca vira `peso`.
- Parser `parsePesoMensagem(texto): number | null` extrai o primeiro número decimal
  (vírgula ou ponto). Reaproveitar `parsePeso` existente em `agent.ts` se ele já fizer isso.

### Handler

Novo módulo `backend/src/services/peso.ts`:

- `registrarPeso(pacienteId, pesoKg, hoje)` → upsert em `pesagens`, retorna o anterior
  mais recente (data < hoje) e o peso inicial da entrevista.
- `formatarRespostaPeso(atual, anterior, inicial)`:
  `⚖️ Peso registrado: 78,4 kg · −0,6 kg desde 02/11 · −3,1 kg desde o início 💚`
  - Sem anterior: omite o trecho "desde dd/mm".
  - Sem peso inicial: omite "desde o início".
  - Variação 0: "mesmo peso de dd/mm".
- Fora de 30–300 kg ou sem número: `⚖️ Não entendi o peso. Me manda só o número, ex: "pesei 78,5".`
- Falha no Supabase: mensagem de erro amigável padrão do agente, log com `redactPhone`.

`agent.ts`: novo ramo `if (intent === 'peso')` no mesmo bloco dos demais intents.

### Relatório semanal

`relatorio.ts` busca as pesagens dos últimos 14 dias do paciente:

- Com pesagem nos últimos 7 dias: linha `⚖️ Peso: 78,4 kg (−0,6 kg na semana)` — a
  variação compara com a pesagem mais recente anterior à janela de 7 dias; sem ela, só o valor.
- Sem pesagem nos últimos 7 dias: `⚖️ Que tal se pesar amanhã em jejum e me mandar "pesei 78,5"?`

## Parte B — Lembretes inteligentes

Mudanças em `dispararAlertas` (`backend/src/services/alertas.ts`). Para não fazer N
consultas por paciente, carregar uma vez por disparo, só para os pacientes com algum
horário casando:

- `registros_diarios` de hoje (`agua_ml`);
- a última refeição (`max(registrado_em)` em `refeicoes`) de cada paciente.

### Regra 1 — água já batida

Pula o lembrete de água se `agua_ml_hoje >= entrevista_dados.hidratacao_ml`
(e `hidratacao_ml > 0`).

### Regra 2 — refeição já registrada

Pula o lembrete de refeição se a última refeição foi registrada há menos de 60 min do
disparo. Não usa `tipo_refeicao` (costuma vir nulo).

### Regra 3 — reengajamento

- Inativo = sem nenhuma refeição nas últimas 48 h **e** paciente cadastrado há mais de 48 h
  (sem refeição nenhuma conta a partir de `pacientes.created_at`).
- Paciente inativo: **todos** os lembretes de rotina (refeição, água, suplemento) são pulados.
- Uma única mensagem de reengajamento é enviada no disparo que casar com `horario_almoco`
  (se nulo, primeiro horário de refeição configurado), quando
  `ultimo_reengajamento_em` é nulo ou anterior à última refeição registrada
  (= uma por sequência de inatividade):
  `👋 Sumiu? Tudo bem, recomeçar faz parte. Me manda o que você comeu hoje que eu anoto pra você 💚`
- Após enviar, grava `alertas_config.ultimo_reengajamento_em = now()`.
- Ao voltar a registrar, a regra 3 deixa de valer naturalmente (última refeição < 48 h).

Migration (mesmo arquivo): `ALTER TABLE alertas_config ADD COLUMN IF NOT EXISTS ultimo_reengajamento_em TIMESTAMPTZ;`

### Funções puras (testáveis)

Extrair a decisão para uma função pura em `alertas.ts`:

```ts
decidirAlertas(ctx: {
  agora: Date;
  refeicoesCasadas: RefeicaoKey[];
  aguaCasou: boolean;
  suplementoCasou: boolean;
  disparoDoReengajamento: boolean;
  aguaHojeMl: number;
  metaAguaMl: number;
  ultimaRefeicaoEm: Date | null;
  pacienteCriadoEm: Date;
  ultimoReengajamentoEm: Date | null;
}): { refeicoes: RefeicaoKey[]; agua: boolean; suplemento: boolean; reengajar: boolean }
```

`dispararAlertas` só busca dados, chama `decidirAlertas` e envia.

### Erros

Se a busca de `registros_diarios`/`refeicoes` falhar, o disparo segue com o
comportamento antigo (manda tudo, sem reengajamento) e loga o erro — é melhor lembrar
demais do que deixar de lembrar.

## Testes (Vitest, TDD)

- `intent.test.ts`: positivos e negativos do intent `peso` listados acima.
- `peso.test.ts`: parse (vírgula/ponto, limites 30/300), `formatarRespostaPeso`
  (com/sem anterior, com/sem inicial, variação 0, positiva, negativa).
- `alertas.test.ts`: `decidirAlertas` cobrindo as 3 regras, as bordas (60 min, 48 h,
  meta de água igual), paciente novo, reengajamento já enviado e paciente que voltou.
- `relatorio.test.ts`: linha de peso com/sem pesagem na semana.
- Suite completa + `npm run typecheck` verdes antes de qualquer commit de código.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/20261109000001_pesagens_e_reengajamento.sql` | novo |
| `backend/src/services/peso.ts` (+ teste) | novo |
| `backend/src/services/intent.ts` (+ teste) | intent `peso` |
| `backend/src/services/agent.ts` | ramo do intent `peso` |
| `backend/src/services/alertas.ts` (+ teste) | `decidirAlertas` + buscas |
| `backend/src/services/relatorio.ts` (+ teste) | linha de peso |
