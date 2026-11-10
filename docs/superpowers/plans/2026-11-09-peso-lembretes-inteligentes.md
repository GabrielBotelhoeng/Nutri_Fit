# Peso + Lembretes Inteligentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paciente registra o peso pelo WhatsApp e vê a evolução; os alertas deixam de cobrar o que já foi feito e reengajam quem sumiu.

**Architecture:** Módulo novo `peso.ts` (formatação pura + I/O fino no Supabase) ligado por um intent `peso` só de fast-path em `intent.ts` e um ramo em `agent.ts`. Em `alertas.ts`, a decisão de envio vira a função pura `decidirAlertas`; `dispararAlertas` só carrega dados (água do dia, última refeição), decide e envia. O relatório semanal ganha uma linha de peso calculada em `peso.ts`.

**Tech Stack:** Node 18 / TypeScript / Express, Supabase JS (Postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-peso-lembretes-inteligentes-design.md`

## Global Constraints

- Branch: `feat/peso-lembretes-inteligentes` (base `fix/alertas-janela-15min`). Nada de push/PR (é com o @devops / Gabriel).
- Peso válido: 30–300 kg. Uma pesagem por paciente por dia (`UNIQUE (paciente_id, data)`), reenvio no mesmo dia = upsert.
- "Hoje" do paciente SEMPRE via `hojeLocal()` de `backend/src/utils/datas.ts`, nunca `toISOString().slice(0,10)`.
- Intent `peso` vem SÓ do fast-path; o prompt/validação do Haiku não muda.
- Não recalcular metas/TMB quando o peso muda.
- Refeição recente = registrada há menos de 60 min. Inativo = 48 h sem refeição (a partir de `pacientes.created_at` se nunca registrou).
- Mensagem de reengajamento (literal): `👋 Sumiu? Tudo bem, recomeçar faz parte. Me manda o que você comeu hoje que eu anoto pra você 💚`
- Falha ao carregar contexto dos alertas → comportamento antigo (manda tudo, sem reengajamento).
- Logs com `redactName`/`redactPhone`, nunca nome/telefone crus.
- Comandos rodam em `backend/`: `npx vitest run <arquivo>`, `npx vitest run`, `npm run typecheck`.

## Review Focus

1. "quero baixar meu peso pra 70" / "meu peso ideal é 65" → NÃO registra peso (objetivo ≠ pesagem). Teste na Task 2.
2. "Pesei 78.4 kg" (ponto, maiúscula, sem espaço antes de kg) → registra 78,4. Teste na Task 2 (intent) e Task 3 (parse via `parsePeso`).
3. Paciente cadastrado há menos de 48 h e sem refeição → recebe lembretes normais, nada de reengajamento. Teste na Task 5.
4. Paciente reengajado que voltou a registrar e sumiu de novo → recebe novo reengajamento (uma vez por sequência). Teste na Task 5.
5. `hidratacao_ml` ausente na entrevista → lembrete de água nunca é pulado por "meta batida". Teste na Task 5.

---

### Task 1: Migration + módulo `peso.ts`

**Files:**
- Create: `supabase/migrations/20261109000001_pesagens_e_reengajamento.sql`
- Create: `backend/src/services/peso.ts`
- Test: `backend/tests/peso.test.ts`

**Interfaces:**
- Produces:
  - `interface Pesagem { data: string; peso_kg: number }`
  - `formatarRespostaPeso(atualKg: number, anterior: Pesagem | null, inicialKg: number | null): string`
  - `formatarLinhaPesoRelatorio(pesagens: Pesagem[], hoje: string): string`
  - `registrarPeso(pacienteId: string, pesoKg: number): Promise<{ anterior: Pesagem | null }>`
  - `pesagensDesde(pacienteId: string, desde: string): Promise<Pesagem[]>` (ordem ascendente por data)
  - `MSG_PESO_INVALIDO: string`

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/20261109000001_pesagens_e_reengajamento.sql`:

```sql
-- Pesagens do paciente: uma por dia, reenvio no mesmo dia sobrescreve (upsert).
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

-- Sem policies: só a service role (backend) acessa, mesmo padrão do sec_3.
ALTER TABLE pesagens ENABLE ROW LEVEL SECURITY;

-- Controle do reengajamento: uma mensagem por sequência de inatividade.
ALTER TABLE alertas_config ADD COLUMN IF NOT EXISTS ultimo_reengajamento_em TIMESTAMPTZ;
```

- [ ] **Step 2: Escrever os testes que falham**

`backend/tests/peso.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upsertSpy, consulta } = vi.hoisted(() => ({
  upsertSpy: vi.fn(),
  consulta: { data: [] as unknown[], error: null as null | { message: string } },
}));

vi.mock('@supabase/supabase-js', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lt', 'gte', 'order', 'limit']) chain[m] = () => chain;
  chain.upsert = (...args: unknown[]) => {
    upsertSpy(...args);
    return Promise.resolve({ error: null });
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(consulta);
  return { createClient: vi.fn(() => ({ from: () => chain })) };
});

import {
  formatarRespostaPeso,
  formatarLinhaPesoRelatorio,
  registrarPeso,
} from '../src/services/peso';

describe('formatarRespostaPeso', () => {
  it('mostra variação desde a última pesagem e desde o início', () => {
    expect(formatarRespostaPeso(78.4, { data: '2026-11-02', peso_kg: 79 }, 81.5)).toBe(
      '⚖️ Peso registrado: 78,4 kg · −0,6 kg desde 02/11 · −3,1 kg desde o início 💚',
    );
  });

  it('ganho de peso usa sinal +', () => {
    expect(formatarRespostaPeso(80, { data: '2026-11-02', peso_kg: 79.5 }, null)).toBe(
      '⚖️ Peso registrado: 80,0 kg · +0,5 kg desde 02/11 💚',
    );
  });

  it('sem pesagem anterior omite o trecho "desde dd/mm"', () => {
    expect(formatarRespostaPeso(78.4, null, 81.5)).toBe(
      '⚖️ Peso registrado: 78,4 kg · −3,1 kg desde o início 💚',
    );
  });

  it('sem anterior e sem inicial mostra só o peso', () => {
    expect(formatarRespostaPeso(78.4, null, null)).toBe('⚖️ Peso registrado: 78,4 kg 💚');
  });

  it('variação zero vira "mesmo peso"', () => {
    expect(formatarRespostaPeso(79, { data: '2026-11-02', peso_kg: 79 }, 79)).toBe(
      '⚖️ Peso registrado: 79,0 kg · mesmo peso de 02/11 · mesmo peso do início 💚',
    );
  });
});

describe('formatarLinhaPesoRelatorio', () => {
  const hoje = '2026-11-09';

  it('com pesagem na semana e base anterior mostra variação da semana', () => {
    const linha = formatarLinhaPesoRelatorio(
      [
        { data: '2026-10-30', peso_kg: 79 },
        { data: '2026-11-06', peso_kg: 78.4 },
      ],
      hoje,
    );
    expect(linha).toBe('⚖️ *Peso:* 78,4 kg (−0,6 kg na semana)');
  });

  it('com pesagem na semana e sem base mostra só o valor', () => {
    expect(formatarLinhaPesoRelatorio([{ data: '2026-11-06', peso_kg: 78.4 }], hoje)).toBe(
      '⚖️ *Peso:* 78,4 kg',
    );
  });

  it('variação zero na semana', () => {
    const linha = formatarLinhaPesoRelatorio(
      [
        { data: '2026-10-30', peso_kg: 78.4 },
        { data: '2026-11-06', peso_kg: 78.4 },
      ],
      hoje,
    );
    expect(linha).toBe('⚖️ *Peso:* 78,4 kg (mesmo peso da semana passada)');
  });

  it('sem pesagem nos últimos 7 dias convida a se pesar', () => {
    expect(formatarLinhaPesoRelatorio([{ data: '2026-10-30', peso_kg: 79 }], hoje)).toBe(
      '⚖️ Que tal se pesar amanhã em jejum e me mandar "pesei 78,5"?',
    );
    expect(formatarLinhaPesoRelatorio([], hoje)).toBe(
      '⚖️ Que tal se pesar amanhã em jejum e me mandar "pesei 78,5"?',
    );
  });
});

describe('registrarPeso', () => {
  beforeEach(() => {
    upsertSpy.mockReset();
    consulta.data = [];
    consulta.error = null;
  });

  it('faz upsert do dia e devolve a pesagem anterior', async () => {
    consulta.data = [{ data: '2026-11-02', peso_kg: '79.00' }];
    const r = await registrarPeso('p1', 78.4);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertSpy.mock.calls[0];
    expect(payload).toMatchObject({ paciente_id: 'p1', peso_kg: 78.4 });
    expect(payload.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(opts).toEqual({ onConflict: 'paciente_id,data' });
    expect(r.anterior).toEqual({ data: '2026-11-02', peso_kg: 79 });
  });

  it('sem pesagem anterior devolve null', async () => {
    const r = await registrarPeso('p1', 78.4);
    expect(r.anterior).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/peso.test.ts`
Expected: FAIL — `Cannot find module '../src/services/peso'` (ou equivalente).

- [ ] **Step 4: Implementar `peso.ts`**

`backend/src/services/peso.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { hojeLocal, somarDias } from '../utils/datas';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export interface Pesagem {
  data: string;
  peso_kg: number;
}

export const MSG_PESO_INVALIDO =
  '⚖️ Não entendi o peso. Me manda só o número, ex: "pesei 78,5".';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const fmtKg = (n: number): string => n.toFixed(1).replace('.', ',');
// "−" (U+2212) em vez de "-": no WhatsApp o hífen some no meio do texto.
const fmtDelta = (d: number): string => `${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))}`;
const fmtDiaMes = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export function formatarRespostaPeso(
  atualKg: number,
  anterior: Pesagem | null,
  inicialKg: number | null,
): string {
  const partes = [`⚖️ Peso registrado: ${fmtKg(atualKg)} kg`];
  if (anterior) {
    const d = round1(atualKg - anterior.peso_kg);
    const dia = fmtDiaMes(anterior.data);
    partes.push(d === 0 ? `mesmo peso de ${dia}` : `${fmtDelta(d)} kg desde ${dia}`);
  }
  if (inicialKg) {
    const d = round1(atualKg - inicialKg);
    partes.push(d === 0 ? 'mesmo peso do início' : `${fmtDelta(d)} kg desde o início`);
  }
  return `${partes.join(' · ')} 💚`;
}

// pesagens em ordem ascendente de data. Semana = últimos 7 dias (inclui hoje);
// base = pesagem mais recente antes da semana.
export function formatarLinhaPesoRelatorio(pesagens: Pesagem[], hoje: string): string {
  const inicioSemana = somarDias(hoje, -7);
  const naSemana = pesagens.filter((p) => p.data >= inicioSemana);
  if (naSemana.length === 0) {
    return '⚖️ Que tal se pesar amanhã em jejum e me mandar "pesei 78,5"?';
  }
  const atual = naSemana[naSemana.length - 1];
  const antes = pesagens.filter((p) => p.data < inicioSemana);
  const base = antes.length > 0 ? antes[antes.length - 1] : null;
  if (!base) return `⚖️ *Peso:* ${fmtKg(atual.peso_kg)} kg`;
  const d = round1(atual.peso_kg - base.peso_kg);
  const variacao = d === 0 ? 'mesmo peso da semana passada' : `${fmtDelta(d)} kg na semana`;
  return `⚖️ *Peso:* ${fmtKg(atual.peso_kg)} kg (${variacao})`;
}

function paraPesagem(r: { data: unknown; peso_kg: unknown }): Pesagem {
  return { data: String(r.data), peso_kg: Number(r.peso_kg) };
}

export async function registrarPeso(
  pacienteId: string,
  pesoKg: number,
): Promise<{ anterior: Pesagem | null }> {
  const hoje = hojeLocal();
  const { error } = await supabase
    .from('pesagens')
    .upsert(
      { paciente_id: pacienteId, data: hoje, peso_kg: pesoKg, updated_at: new Date().toISOString() },
      { onConflict: 'paciente_id,data' },
    );
  if (error) throw new Error(`[peso] Falha ao salvar pesagem: ${error.message}`);

  const { data, error: errAnterior } = await supabase
    .from('pesagens')
    .select('data, peso_kg')
    .eq('paciente_id', pacienteId)
    .lt('data', hoje)
    .order('data', { ascending: false })
    .limit(1);
  // Pesagem já foi salva; sem a anterior a resposta só fica mais curta.
  if (errAnterior) {
    console.error('[peso] Falha ao buscar pesagem anterior:', errAnterior.message);
    return { anterior: null };
  }
  const linha = (data ?? [])[0] as { data: unknown; peso_kg: unknown } | undefined;
  return { anterior: linha ? paraPesagem(linha) : null };
}

export async function pesagensDesde(pacienteId: string, desde: string): Promise<Pesagem[]> {
  const { data, error } = await supabase
    .from('pesagens')
    .select('data, peso_kg')
    .eq('paciente_id', pacienteId)
    .gte('data', desde)
    .order('data', { ascending: true });
  if (error) throw new Error(`[peso] Falha ao buscar pesagens: ${error.message}`);
  return ((data ?? []) as Array<{ data: unknown; peso_kg: unknown }>).map(paraPesagem);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/peso.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261109000001_pesagens_e_reengajamento.sql backend/src/services/peso.ts backend/tests/peso.test.ts
git commit -m "feat(peso): tabela pesagens e formatação da evolução de peso"
```

---

### Task 2: Intent `peso` no fast-path

**Files:**
- Modify: `backend/src/services/intent.ts` (tipo `Intent` linha 9; regexes antes de `classificarIntencaoRapida`; início da função)
- Test: `backend/tests/intent.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Produces: `Intent` passa a incluir `'peso'`; `classificarIntencaoRapida(texto)` devolve `'peso'` para pesagens.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar no fim de `backend/tests/intent.test.ts`:

```ts
describe('classificarIntencaoRapida — peso', () => {
  it.each([
    'pesei 78,4',
    'me pesei hoje: 79kg',
    'meu peso hoje é 79',
    'peso 80,2',
    'tô com 80kg na balança',
    'balança marcou 77,9',
    'Pesei 78.4 kg',
  ])('"%s" vira peso', (texto) => {
    expect(classificarIntencaoRapida(texto)).toBe('peso');
  });

  it.each([
    'comi 1kg de melancia',
    'quanto eu devo pesar?',
    'quero perder peso',
    'quero baixar meu peso pra 70',
    'meu peso ideal é 65',
    'posso comer pão? estou acima do peso',
    'pesei 78 hoje, tá bom?',
  ])('"%s" NÃO vira peso', (texto) => {
    expect(classificarIntencaoRapida(texto)).not.toBe('peso');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/intent.test.ts`
Expected: FAIL nos 7 casos positivos (recebem `null`/outro intent).

- [ ] **Step 3: Implementar**

Em `backend/src/services/intent.ts`, linha 9:

```ts
export type Intent = 'registrar' | 'corrigir' | 'agua' | 'consulta' | 'substituicao' | 'saldo' | 'peso';
```

Logo antes de `// Retorna Intent quando confiante; null quando deve consultar o Haiku.`:

```ts
// Pesagem exige marcador explícito: "kg" sozinho é comida ("comi 1kg de melancia").
// \b não é Unicode-safe ("balança"); usar (?:^|\W)/(?=\W|$).
const PESO_MARCADOR_RE =
  /(?:^|\W)(pesei|meu\s+peso|peso\s+(?:hoje|atual|agora|de\s+hoje)|balan[çc]a)(?=\W|$)|^peso\s*:?\s*\d/i;
const PESO_NUMERO_RE = /\d+(?:[.,]\d+)?/;
// Objetivo/meta não é pesagem: "quero baixar meu peso pra 70", "meu peso ideal é 65".
const PESO_OBJETIVO_RE =
  /(?:^|\W)(quero|queria|meta|objetivo|chegar|baixar|perder|ganhar|emagrecer|ideal|devo|deveria|preciso)(?=\W|$)/i;

function ehRegistroDePeso(t: string): boolean {
  return (
    !PERGUNTA_RE.test(t) &&
    PESO_MARCADOR_RE.test(t) &&
    PESO_NUMERO_RE.test(t) &&
    !PESO_OBJETIVO_RE.test(t)
  );
}
```

Dentro de `classificarIntencaoRapida`, logo depois de `if (t.length === 0) return null;`:

```ts
  // Só fast-path: o Haiku nunca devolve 'peso'.
  if (ehRegistroDePeso(t)) {
    return 'peso';
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/intent.test.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 5: Typecheck (o union cresceu)**

Run: `npm run typecheck`
Expected: sem erros. Se algum `switch`/`Record<Intent, …>` exaustivo reclamar, adicionar o caso `'peso'` lá (procurar com `grep -rn "Intent" src`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/intent.ts backend/tests/intent.test.ts
git commit -m "feat(intent): intent peso por fast-path com marcador de pesagem"
```

---

### Task 3: Ramo `peso` no agente

**Files:**
- Modify: `backend/src/services/agent.ts` (imports no topo; novo ramo logo antes de `if (intent === 'agua') {`, ~linha 1177)
- Test: `backend/tests/peso.test.ts` (parse via `parsePeso`)

**Interfaces:**
- Consumes: `registrarPeso`, `formatarRespostaPeso`, `MSG_PESO_INVALIDO` (Task 1); `parsePeso` (já existe em `agent.ts:301`); `Intent 'peso'` (Task 2).

- [ ] **Step 1: Teste de parse que pina o Review Focus #2**

Acrescentar em `backend/tests/peso.test.ts` (o `agent.ts` puxa Anthropic/rag/evolution no topo — mockar antes do import):

```ts
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));
vi.mock('../src/services/rag', () => ({ query: vi.fn() }));

import { parsePeso } from '../src/services/agent';

describe('parsePeso nas mensagens de pesagem', () => {
  it.each([
    ['pesei 78,4', 78.4],
    ['Pesei 78.4 kg', 78.4],
    ['me pesei hoje: 79kg', 79],
    ['balança marcou 77,9', 77.9],
  ])('"%s" → %d', (texto, esperado) => {
    expect(parsePeso(texto)).toBe(esperado);
  });

  it('fora de 30–300 devolve null', () => {
    expect(parsePeso('pesei 12')).toBeNull();
    expect(parsePeso('pesei 450')).toBeNull();
  });
});
```

Os `vi.mock` são içados pelo Vitest, então podem ficar junto do `describe` novo. Se o import de `agent.ts` exigir mais mocks (ver `tests/agent-etapa14.test.ts` como referência), copiar os mesmos.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/peso.test.ts`
Expected: PASS — `parsePeso` já existe; o teste só pina o comportamento que o ramo novo usa.

- [ ] **Step 3: Implementar o ramo**

Em `agent.ts`, junto dos imports de serviços:

```ts
import { registrarPeso, formatarRespostaPeso, MSG_PESO_INVALIDO } from './peso';
```

Logo antes de `if (intent === 'agua') {`:

```ts
  if (intent === 'peso') {
    const pesoKg = parsePeso(texto);
    if (pesoKg === null) {
      await sendText(phone, MSG_PESO_INVALIDO);
      return;
    }
    try {
      const { anterior } = await registrarPeso(paciente.id, pesoKg);
      // Peso da entrevista é o ponto de partida. Metas NÃO são recalculadas (decisão do nutri).
      const inicialKg = Number(dadosEstado['peso_kg']) || null;
      await sendText(phone, formatarRespostaPeso(pesoKg, anterior, inicialKg));
    } catch (err) {
      console.error('[agent] Falha ao registrar peso:', err);
      await sendText(phone, '⚖️ Não consegui salvar seu peso agora. Tenta de novo daqui a pouco?');
    }
    return;
  }
```

Antes de commitar, confirmar que `dadosEstado` carrega `peso_kg` da entrevista: `grep -n "peso_kg" src/services/agent.ts` (o onboarding grava `novoDado.peso_kg`, ~linha 624, no mesmo objeto de onde `obterMetas(dadosEstado)` lê as metas).

- [ ] **Step 4: Suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agent.ts backend/tests/peso.test.ts
git commit -m "feat(agent): registra peso e responde com a evolução"
```

---

### Task 4: Linha de peso no relatório semanal

**Files:**
- Modify: `backend/src/services/relatorio.ts` (interface `DadosMensagem` ~linha 152; retorno de `formatarMensagemRelatorio`; laço de `gerarRelatorioSemanal`)
- Test: `backend/tests/relatorio-semanal.test.ts`

**Interfaces:**
- Consumes: `pesagensDesde`, `formatarLinhaPesoRelatorio` (Task 1).
- Produces: `DadosMensagem.pesoLinha?: string` (opcional, os chamadores antigos continuam válidos).

- [ ] **Step 1: Teste que falha**

Acrescentar em `backend/tests/relatorio-semanal.test.ts`, dentro do `describe` que já usa `formatarMensagemRelatorio` (reaproveitando `diasBase` e `metas` de lá):

```ts
  it('inclui a linha de peso quando informada', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Ana',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1700,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Continue firme!',
      pesoLinha: '⚖️ *Peso:* 78,4 kg (−0,6 kg na semana)',
    });
    expect(msg).toContain('⚖️ *Peso:* 78,4 kg (−0,6 kg na semana)');
    expect(msg.indexOf('⚖️')).toBeLessThan(msg.indexOf('💚 Continue firme!'));
  });

  it('sem pesoLinha não mostra nada de peso', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Ana',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1700,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Continue firme!',
    });
    expect(msg).not.toContain('⚖️');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/relatorio-semanal.test.ts`
Expected: FAIL — erro de tipo/`toContain` no primeiro teste novo.

- [ ] **Step 3: Implementar**

Em `DadosMensagem`, adicionar:

```ts
  pesoLinha?: string;
```

No `return` de `formatarMensagemRelatorio`, trocar:

```ts
    hidratacaoLinha +
    linhaStreakTop +
```

por:

```ts
    hidratacaoLinha +
    (d.pesoLinha ? `\n${d.pesoLinha}` : '') +
    linhaStreakTop +
```

Imports no topo de `relatorio.ts`:

```ts
import { pesagensDesde, formatarLinhaPesoRelatorio } from './peso';
```

Em `gerarRelatorioSemanal`, logo antes de `const mensagem = formatarMensagemRelatorio({`:

```ts
      // Peso é complemento: falha na busca não derruba o relatório.
      const pesagens = await pesagensDesde(String(p.id), somarDias(hoje, -14)).catch((err) => {
        console.error(`[relatorio] Falha ao buscar pesagens de ${redactName(p.nome as string)}:`, err);
        return [];
      });
      const pesoLinha = formatarLinhaPesoRelatorio(pesagens, hoje);
```

E passar `pesoLinha,` no objeto de `formatarMensagemRelatorio({ ... })`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/relatorio-semanal.test.ts && npm run typecheck`
Expected: PASS, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/relatorio.ts backend/tests/relatorio-semanal.test.ts
git commit -m "feat(relatorio): linha de peso e convite para pesagem semanal"
```

---

### Task 5: `decidirAlertas` (regras puras)

**Files:**
- Modify: `backend/src/services/alertas.ts` (novo bloco depois de `horarioNaJanela`)
- Test: `backend/tests/alertas-decisao.test.ts` (novo)

**Interfaces:**
- Consumes: `RefeicaoKey` (já exportado em `alertas.ts`).
- Produces:
  - `interface ContextoDecisao { agora: Date; refeicoesCasadas: RefeicaoKey[]; aguaCasou: boolean; suplementoCasou: boolean; disparoDoReengajamento: boolean; aguaHojeMl: number; metaAguaMl: number; ultimaRefeicaoEm: Date | null; pacienteCriadoEm: Date; ultimoReengajamentoEm: Date | null }`
  - `interface DecisaoAlertas { refeicoes: RefeicaoKey[]; agua: boolean; suplemento: boolean; reengajar: boolean }`
  - `decidirAlertas(ctx: ContextoDecisao): DecisaoAlertas`
  - `MENSAGEM_REENGAJAMENTO: string`

- [ ] **Step 1: Testes que falham**

`backend/tests/alertas-decisao.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }));
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));

import { decidirAlertas, type ContextoDecisao } from '../src/services/alertas';

const AGORA = new Date('2026-11-09T15:20:00Z'); // 12:20 BRT
const horasAtras = (h: number): Date => new Date(AGORA.getTime() - h * 3600_000);
const minAtras = (m: number): Date => new Date(AGORA.getTime() - m * 60_000);

function ctx(over: Partial<ContextoDecisao> = {}): ContextoDecisao {
  return {
    agora: AGORA,
    refeicoesCasadas: ['almoco'],
    aguaCasou: true,
    suplementoCasou: true,
    disparoDoReengajamento: true,
    aguaHojeMl: 500,
    metaAguaMl: 2000,
    ultimaRefeicaoEm: horasAtras(4),
    pacienteCriadoEm: horasAtras(24 * 30),
    ultimoReengajamentoEm: null,
    ...over,
  };
}

describe('decidirAlertas', () => {
  it('paciente ativo sem nada feito recebe tudo que casou', () => {
    expect(decidirAlertas(ctx())).toEqual({
      refeicoes: ['almoco'], agua: true, suplemento: true, reengajar: false,
    });
  });

  describe('regra 1 — água', () => {
    it('meta batida pula a água', () => {
      expect(decidirAlertas(ctx({ aguaHojeMl: 2000 })).agua).toBe(false);
      expect(decidirAlertas(ctx({ aguaHojeMl: 2500 })).agua).toBe(false);
    });
    it('abaixo da meta mantém', () => {
      expect(decidirAlertas(ctx({ aguaHojeMl: 1999 })).agua).toBe(true);
    });
    it('sem meta de hidratação nunca pula', () => {
      expect(decidirAlertas(ctx({ metaAguaMl: 0, aguaHojeMl: 5000 })).agua).toBe(true);
    });
    it('água que não casou continua false', () => {
      expect(decidirAlertas(ctx({ aguaCasou: false })).agua).toBe(false);
    });
  });

  describe('regra 2 — refeição recente', () => {
    it('refeição há 59 min pula o lembrete de refeição', () => {
      expect(decidirAlertas(ctx({ ultimaRefeicaoEm: minAtras(59) })).refeicoes).toEqual([]);
    });
    it('refeição há exatamente 60 min mantém', () => {
      expect(decidirAlertas(ctx({ ultimaRefeicaoEm: minAtras(60) })).refeicoes).toEqual(['almoco']);
    });
    it('refeição recente não afeta água nem suplemento', () => {
      const d = decidirAlertas(ctx({ ultimaRefeicaoEm: minAtras(10) }));
      expect(d.agua).toBe(true);
      expect(d.suplemento).toBe(true);
    });
  });

  describe('regra 3 — reengajamento', () => {
    const inativo = { ultimaRefeicaoEm: horasAtras(48) };

    it('inativo há 48 h: silencia rotina e reengaja', () => {
      expect(decidirAlertas(ctx(inativo))).toEqual({
        refeicoes: [], agua: false, suplemento: false, reengajar: true,
      });
    });
    it('47 h sem registrar ainda é ativo', () => {
      expect(decidirAlertas(ctx({ ultimaRefeicaoEm: horasAtras(47) })).reengajar).toBe(false);
    });
    it('inativo fora do horário de reengajamento: só silencia', () => {
      expect(decidirAlertas(ctx({ ...inativo, disparoDoReengajamento: false }))).toEqual({
        refeicoes: [], agua: false, suplemento: false, reengajar: false,
      });
    });
    it('já reengajado nesta sequência não repete', () => {
      const d = decidirAlertas(ctx({ ...inativo, ultimoReengajamentoEm: horasAtras(24) }));
      expect(d.reengajar).toBe(false);
    });
    it('voltou a registrar depois do reengajamento e sumiu de novo: reengaja de novo', () => {
      const d = decidirAlertas(ctx({
        ultimaRefeicaoEm: horasAtras(72),
        ultimoReengajamentoEm: horasAtras(24 * 10),
      }));
      expect(d.reengajar).toBe(true);
    });
    it('nunca registrou e foi cadastrado há menos de 48 h: lembretes normais', () => {
      const d = decidirAlertas(ctx({ ultimaRefeicaoEm: null, pacienteCriadoEm: horasAtras(10) }));
      expect(d).toEqual({ refeicoes: ['almoco'], agua: true, suplemento: true, reengajar: false });
    });
    it('nunca registrou e foi cadastrado há 3 dias: reengaja', () => {
      const d = decidirAlertas(ctx({ ultimaRefeicaoEm: null, pacienteCriadoEm: horasAtras(72) }));
      expect(d.reengajar).toBe(true);
    });
    it('nunca registrou e já foi reengajado: não repete', () => {
      const d = decidirAlertas(ctx({
        ultimaRefeicaoEm: null,
        pacienteCriadoEm: horasAtras(72),
        ultimoReengajamentoEm: horasAtras(20),
      }));
      expect(d.reengajar).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/alertas-decisao.test.ts`
Expected: FAIL — `decidirAlertas is not a function` / export inexistente.

- [ ] **Step 3: Implementar**

Em `alertas.ts`, logo depois de `horarioNaJanela`:

```ts
export const MENSAGEM_REENGAJAMENTO =
  '👋 Sumiu? Tudo bem, recomeçar faz parte. Me manda o que você comeu hoje que eu anoto pra você 💚';

const REFEICAO_RECENTE_MS = 60 * 60 * 1000;
const INATIVIDADE_MS = 48 * 60 * 60 * 1000;

export interface ContextoDecisao {
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
}

export interface DecisaoAlertas {
  refeicoes: RefeicaoKey[];
  agua: boolean;
  suplemento: boolean;
  reengajar: boolean;
}

// Lembrete que reage ao comportamento: não cobra o que já foi feito e, pra quem sumiu,
// troca a rotina (que vira spam e leva a bloqueio) por UMA mensagem por sequência de inatividade.
export function decidirAlertas(ctx: ContextoDecisao): DecisaoAlertas {
  const agoraMs = ctx.agora.getTime();
  const referencia = ctx.ultimaRefeicaoEm ?? ctx.pacienteCriadoEm;

  if (agoraMs - referencia.getTime() >= INATIVIDADE_MS) {
    const jaReengajado =
      ctx.ultimoReengajamentoEm !== null &&
      (ctx.ultimaRefeicaoEm === null || ctx.ultimoReengajamentoEm > ctx.ultimaRefeicaoEm);
    return {
      refeicoes: [],
      agua: false,
      suplemento: false,
      reengajar: ctx.disparoDoReengajamento && !jaReengajado,
    };
  }

  const refeicaoRecente =
    ctx.ultimaRefeicaoEm !== null && agoraMs - ctx.ultimaRefeicaoEm.getTime() < REFEICAO_RECENTE_MS;
  const aguaBatida = ctx.metaAguaMl > 0 && ctx.aguaHojeMl >= ctx.metaAguaMl;

  return {
    refeicoes: refeicaoRecente ? [] : ctx.refeicoesCasadas,
    agua: ctx.aguaCasou && !aguaBatida,
    suplemento: ctx.suplementoCasou,
    reengajar: false,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/alertas-decisao.test.ts`
Expected: PASS (16 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/alertas.ts backend/tests/alertas-decisao.test.ts
git commit -m "feat(alertas): regras puras de lembrete inteligente e reengajamento"
```

---

### Task 6: `dispararAlertas` usa o contexto e `decidirAlertas`

**Files:**
- Modify: `backend/src/services/alertas.ts` (`dispararAlertas` inteiro + helper `carregarContexto`; import de `hojeLocal`)
- Modify: `backend/tests/alertas-janela.test.ts` (mock por tabela + casos novos)

**Interfaces:**
- Consumes: `decidirAlertas`, `MENSAGEM_REENGAJAMENTO`, `horarioNaJanela`, `REFEICOES_KEYS`, `KEY_TO_COL` (mesmo arquivo); `hojeLocal` de `../utils/datas`.
- Produces: `dispararAlertas(horario: string): Promise<void>` (assinatura igual).

- [ ] **Step 1: Trocar o mock do teste por um mock por tabela e escrever os casos novos**

No topo de `backend/tests/alertas-janela.test.ts`, substituir o bloco `vi.hoisted` + `vi.mock('@supabase/supabase-js', …)` por:

```ts
type Resultado = { data: unknown; error: null | { message: string } };

const { resultados, sendText, updates } = vi.hoisted(() => ({
  resultados: {} as Record<string, Resultado>,
  sendText: vi.fn(),
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock('@supabase/supabase-js', () => {
  function chainPara(table: string) {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'order', 'limit']) chain[m] = () => chain;
    chain.update = (values: Record<string, unknown>) => {
      updates.push({ table, values });
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve(resultados[table] ?? { data: [], error: null });
    return chain;
  }
  return { createClient: vi.fn(() => ({ from: (t: string) => chainPara(t) })) };
});
```

No `describe('dispararAlertas')`, trocar `paciente` e `beforeEach` por:

```ts
  const paciente = {
    whatsapp: '5562999990000',
    nome: 'Teste',
    ativo: true,
    created_at: '2026-01-01T00:00:00Z',
    entrevista_dados: { hidratacao_ml: 2000 },
  };
```

```ts
  beforeEach(() => {
    sendText.mockReset();
    updates.length = 0;
    resultados.alertas_config = { data: [{ ...configBase, ultimo_reengajamento_em: null }], error: null };
    resultados.registros_diarios = { data: [], error: null };
    // Ativo: comeu há 4 h.
    resultados.refeicoes = {
      data: [{ paciente_id: 'p1', registrado_em: new Date(Date.now() - 4 * 3600_000).toISOString() }],
      error: null,
    };
  });
```

Trocar o teste `'erro do Supabase não envia nada'` por:

```ts
  it('erro do Supabase ao buscar configs não envia nada', async () => {
    resultados.alertas_config = { data: null, error: { message: 'falhou' } };
    await dispararAlertas('12:15');
    expect(sendText).not.toHaveBeenCalled();
  });
```

Acrescentar no mesmo `describe`:

```ts
  it('água pulada quando a meta do dia já foi batida', async () => {
    resultados.registros_diarios = { data: [{ paciente_id: 'p1', agua_ml: 2000 }], error: null };
    await dispararAlertas('12:15');
    const textos = sendText.mock.calls.map((c) => c[1] as string).join('\n');
    expect(sendText).toHaveBeenCalledTimes(2); // almoço + suplemento
    expect(textos).not.toContain('hidratar');
  });

  it('almoço pulado quando já registrou refeição há menos de 1 h', async () => {
    resultados.refeicoes = {
      data: [{ paciente_id: 'p1', registrado_em: new Date(Date.now() - 20 * 60_000).toISOString() }],
      error: null,
    };
    await dispararAlertas('12:15');
    const textos = sendText.mock.calls.map((c) => c[1] as string).join('\n');
    expect(textos).not.toContain('almoço');
    expect(sendText).toHaveBeenCalledTimes(2); // água + suplemento
  });

  it('inativo há dias recebe só o reengajamento no horário do almoço e marca a data', async () => {
    resultados.refeicoes = { data: [], error: null };
    await dispararAlertas('12:15');
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][1]).toContain('Sumiu?');
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe('alertas_config');
    expect(updates[0].values).toHaveProperty('ultimo_reengajamento_em');
  });

  it('inativo fora do horário do almoço não recebe nada', async () => {
    resultados.refeicoes = { data: [], error: null };
    await dispararAlertas('07:00');
    expect(sendText).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('falha ao carregar contexto mantém o comportamento antigo', async () => {
    resultados.refeicoes = { data: null, error: { message: 'timeout' } };
    await dispararAlertas('12:15');
    expect(sendText).toHaveBeenCalledTimes(3);
    expect(updates).toHaveLength(0);
  });
```

Os testes antigos (`dispara almoço, água e suplemento…`, `não dispara nada no quarto de hora seguinte`, `café de 07:10 sai no cron de 07:00`) continuam iguais e devem seguir passando com o paciente ativo do `beforeEach`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/alertas-janela.test.ts`
Expected: FAIL nos casos novos (água/almoço/reengajamento ainda são enviados como antes).

- [ ] **Step 3: Implementar**

Import no topo de `alertas.ts`:

```ts
import { hojeLocal } from '../utils/datas';
```

Substituir `dispararAlertas` inteira (do comentário `export async function dispararAlertas` até o fim do arquivo) por:

```ts
const BUSCA_REFEICOES_DIAS = 30;

interface ContextoPacientes {
  aguaHoje: Map<string, number>;
  ultimaRefeicao: Map<string, Date>;
}

// Uma consulta por tabela pro lote inteiro (não N por paciente). Falha → null e o
// disparo segue sem filtros: melhor lembrar demais do que deixar de lembrar.
async function carregarContexto(ids: string[], agora: Date): Promise<ContextoPacientes | null> {
  try {
    const desde = new Date(agora.getTime() - BUSCA_REFEICOES_DIAS * 24 * 3600_000).toISOString();
    const [regs, refs] = await Promise.all([
      supabase.from('registros_diarios').select('paciente_id, agua_ml').in('paciente_id', ids).eq('data', hojeLocal()),
      supabase.from('refeicoes').select('paciente_id, registrado_em').in('paciente_id', ids).gte('registrado_em', desde),
    ]);
    if (regs.error) throw new Error(regs.error.message);
    if (refs.error) throw new Error(refs.error.message);

    const aguaHoje = new Map<string, number>();
    for (const r of (regs.data ?? []) as Array<{ paciente_id: string; agua_ml: number | string | null }>) {
      aguaHoje.set(r.paciente_id, Number(r.agua_ml) || 0);
    }
    const ultimaRefeicao = new Map<string, Date>();
    for (const r of (refs.data ?? []) as Array<{ paciente_id: string; registrado_em: string }>) {
      const em = new Date(r.registrado_em);
      const atual = ultimaRefeicao.get(r.paciente_id);
      if (!atual || em > atual) ultimaRefeicao.set(r.paciente_id, em);
    }
    return { aguaHoje, ultimaRefeicao };
  } catch (err) {
    console.error('[alertas] Falha ao carregar contexto (seguindo sem filtros):', err);
    return null;
  }
}

export async function dispararAlertas(horario: string): Promise<void> {
  console.log(`[alertas] Verificando alertas para horario ${horario}`);
  const agora = new Date();

  // entrevista_dados vem junto pra calcular porcao de agua no disparo.
  const { data: configs, error } = await supabase
    .from('alertas_config')
    .select(`
      paciente_id,
      horario_cafe,
      horario_lanche_manha,
      horario_almoco,
      horario_lanche_tarde,
      horario_jantar,
      horarios_agua,
      horario_suplementos,
      ultimo_reengajamento_em,
      pacientes!inner(whatsapp, nome, ativo, created_at, entrevista_dados)
    `)
    .eq('ativo', true)
    .eq('pacientes.ativo', true);

  if (error) {
    console.error('[alertas] Erro ao buscar configuracoes:', error.message);
    return;
  }

  if (!configs || configs.length === 0) {
    console.log('[alertas] Nenhuma configuracao ativa — skip');
    return;
  }

  const candidatos = [];
  for (const config of configs) {
    const refeicoesCasadas = REFEICOES_KEYS.filter((k) =>
      horarioNaJanela((config as unknown as Record<string, string | null>)[KEY_TO_COL[k]], horario),
    );
    const aguaArr = (config.horarios_agua as string[]) || [];
    const aguaCasou = aguaArr.some((h) => horarioNaJanela(h, horario));
    const supArr = (config.horario_suplementos as string[]) || [];
    const suplementoCasou = supArr.some((h) => horarioNaJanela(h, horario));
    if (refeicoesCasadas.length === 0 && !aguaCasou && !suplementoCasou) continue;

    // Reengajamento sai no almoço (ou no 1º horário de refeição) pra não chegar de madrugada.
    const horarioReengajamento =
      config.horario_almoco ??
      REFEICOES_KEYS.map((k) => (config as unknown as Record<string, string | null>)[KEY_TO_COL[k]]).find(Boolean) ??
      null;

    candidatos.push({
      config,
      aguaArr,
      refeicoesCasadas,
      aguaCasou,
      suplementoCasou,
      disparoDoReengajamento: horarioNaJanela(horarioReengajamento, horario),
    });
  }

  if (candidatos.length === 0) {
    console.log(`[alertas] Concluido — 0 alertas enviados para horario ${horario}`);
    return;
  }

  const contexto = await carregarContexto(candidatos.map((c) => String(c.config.paciente_id)), agora);

  let enviados = 0;

  for (const c of candidatos) {
    const pacienteId = String(c.config.paciente_id);
    const paciente = c.config.pacientes as unknown as {
      whatsapp: string;
      nome: string;
      ativo: boolean;
      created_at: string;
      entrevista_dados: Record<string, unknown> | null;
    };
    const wpp = paciente.whatsapp;
    const hidratacaoMl = Number(paciente.entrevista_dados?.['hidratacao_ml']) || 0;

    const decisao = contexto
      ? decidirAlertas({
          agora,
          refeicoesCasadas: c.refeicoesCasadas,
          aguaCasou: c.aguaCasou,
          suplementoCasou: c.suplementoCasou,
          disparoDoReengajamento: c.disparoDoReengajamento,
          aguaHojeMl: contexto.aguaHoje.get(pacienteId) ?? 0,
          metaAguaMl: hidratacaoMl,
          ultimaRefeicaoEm: contexto.ultimaRefeicao.get(pacienteId) ?? null,
          pacienteCriadoEm: new Date(paciente.created_at),
          ultimoReengajamentoEm: c.config.ultimo_reengajamento_em
            ? new Date(c.config.ultimo_reengajamento_em as string)
            : null,
        })
      : { refeicoes: c.refeicoesCasadas, agua: c.aguaCasou, suplemento: c.suplementoCasou, reengajar: false };

    if (decisao.reengajar) {
      await sendText(wpp, MENSAGEM_REENGAJAMENTO);
      const { error: errUpd } = await supabase
        .from('alertas_config')
        .update({ ultimo_reengajamento_em: agora.toISOString() })
        .eq('paciente_id', pacienteId);
      if (errUpd) console.error('[alertas] Falha ao marcar reengajamento:', errUpd.message);
      console.log(`[alertas] reengajamento enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    for (const tipo of decisao.refeicoes) {
      await sendText(wpp, MENSAGENS_REFEICAO[tipo]);
      console.log(`[alertas] ${tipo} enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    if (decisao.agua) {
      const porcaoMl = c.aguaArr.length > 0 && hidratacaoMl > 0
        ? Math.ceil(hidratacaoMl / c.aguaArr.length)
        : null;
      await sendText(wpp, mensagemAgua(porcaoMl));
      console.log(`[alertas] agua (${porcaoMl ?? 'porcao padrao'}ml) enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }

    if (decisao.suplemento) {
      await sendText(wpp, MENSAGENS_REFEICAO['suplemento']);
      console.log(`[alertas] suplemento enviado para ${redactName(paciente.nome)} (${redactPhone(wpp)})`);
      enviados++;
    }
  }

  console.log(`[alertas] Concluido — ${enviados} alertas enviados para horario ${horario}`);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/alertas-janela.test.ts tests/alertas-decisao.test.ts && npm run typecheck`
Expected: PASS em todos (antigos + 5 novos), typecheck limpo. Se o typecheck reclamar do array `candidatos` sem tipo, tipar com uma `interface Candidato` local com os mesmos campos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/alertas.ts backend/tests/alertas-janela.test.ts
git commit -m "feat(alertas): pula lembrete já cumprido e reengaja paciente inativo"
```

---

### Task 7: Verificação final local

**Files:** nenhum de código (só memória do projeto).

- [ ] **Step 1: Suite completa + typecheck**

Run (em `backend/`): `npx vitest run && npm run typecheck`
Expected: tudo verde; contagem de testes = baseline + novos. Anotar o número.

- [ ] **Step 2: Aplicar a migration no Postgres local**

Com a stack local de pé (`docker compose -f docker-compose.local.yml up -d`):

```bash
docker exec -i nutrichat_postgres psql -U postgres -d postgres < supabase/migrations/20261109000001_pesagens_e_reengajamento.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `ALTER TABLE`. Se o usuário/banco do container forem outros, conferir em `docker/` e `docker-compose.local.yml`.

- [ ] **Step 3: Smoke manual (local)**

`docker restart nutrichat_backend` e, pelo `backend/agentes-teste/scripts/backend-local.mjs` ou pelo WhatsApp de teste:
- "pesei 78,4" → resposta `⚖️ Peso registrado: 78,4 kg …`
- "pesei 78,0" no mesmo dia → sobrescreve (só 1 linha em `pesagens` para hoje).
- "quero baixar meu peso pra 70" → NÃO responde com ⚖️.
- `curl -X POST http://localhost:3001/api/alertas/disparar -H "x-internal-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" -d '{"horario":"12:15"}'` com um paciente sem refeições há 3 dias → só o "👋 Sumiu?" e `ultimo_reengajamento_em` preenchido. (Conferir o formato do body em `backend/src/routes/alertas.ts`.)

- [ ] **Step 4: Salvar memória + graphify**

Criar `memory/peso_lembretes_inteligentes_2026_11_09.md` (branch, commits, contagem de testes, migration pendente de aplicar em prod, deploy bloqueado pela migração Oracle) e a linha correspondente no `MEMORY.md`. Rodar a atualização do graphify (regra padrão do projeto).
