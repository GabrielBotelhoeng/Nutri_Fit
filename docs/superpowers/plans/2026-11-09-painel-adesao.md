# Painel de Adesão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O nutricionista vê, na lista de pacientes, quem está aderindo e quem precisa de atenção, e abre uma ficha com 14 dias de consumo e a curva de peso.

**Architecture:** As regras de adesão moram no backend, num módulo novo `services/adesao.ts`: função pura `resumirAdesao` + duas funções de I/O em lote (`carregarAdesaoLista`, `obterFichaAdesao`). As rotas em `routes/pacientes.ts` só chamam essas funções. O painel recebe `adesao` em cada paciente de `GET /api/pacientes`, mostra card/colunas/filtro e abre `AdesaoModal`, que busca `GET /api/pacientes/:id/adesao` e desenha gráficos em SVG próprio.

**Tech Stack:** Backend Node 18 / TypeScript / Express / Supabase JS / Vitest. Painel React 19 + Vite + Tailwind 4 (sem lib de gráficos).

**Spec:** `docs/superpowers/specs/2026-11-09-painel-adesao-design.md`

## Global Constraints

- Branch `feat/painel-adesao`, base = `feat/painel-refino` (PR #4) + `main` (já com PR #6). Nada de push/PR sem o Gabriel pedir.
- Sem migration nova: usa `pesagens` e a RPC `ultima_refeicao_por_paciente(ids)` do PR #6.
- "Hoje" no backend SEMPRE via `hojeLocal()` / `somarDias()` de `backend/src/utils/datas.ts`.
- Dia com registro = `registros_diarios.kcal_consumido > 0`. Adesão 7d = datas em `[hoje−7, hoje−1]`.
- Atenção = não expirado E (`sem_registro_48h`: ≥ 48 h desde a última refeição, ou desde `created_at` se nunca registrou; OU `baixa_adesao`: adesão 7d ≤ 2 e cadastro há ≥ 7 dias). Os dois → `motivo = 'sem_registro_48h'`.
- Tendência de peso: última pesagem vs anterior (ou `entrevista_dados.peso_kg`); `desceu`/`subiu` se |Δ| ≥ 0,1 kg, senão `estavel`; `null` sem base ou sem pesagem.
- Falha ao carregar adesão na lista → 200 com `adesao: null` em todos; a lista nunca quebra.
- Ficha: `dias` sempre com 14 entradas `[hoje−13, hoje]`, zeros nos dias vazios; `pesagens` dos últimos 90 dias.
- Painel: texto em pt-BR com acentos; cores só pelos tokens CSS de `src/index.css` (`--color-*`); funciona em 360 px; alvos de toque ≥ 44 px.
- Comandos: backend em `backend/` (`npx vitest run <arquivo>`, `npx vitest run`, `npm run typecheck`); painel em `nutrichat-painel/` (`npm run build`, `npm run lint`).

## Review Focus

1. Paciente cadastrado hoje (sem refeição, sem registros) → não aparece em Atenção e mostra "nunca" no último registro sem ⚠. Teste na Task 1.
2. Paciente com plano expirado e sumido há semanas → não aparece em Atenção (já está no card Expirados). Teste na Task 1.
3. `GET /api/pacientes` quando a RPC ou `pesagens` falha (ex.: migration do PR #6 ainda não aplicada em prod) → 200 com `adesao: null`, painel mostra "—". Teste na Task 2.
4. Ficha de paciente sem nenhum registro nem pesagem → 14 dias zerados, sem divisão por zero na meta (meta 0 ou ausente). Teste na Task 2 (backend) e checagem visual na Task 5.
5. Datas: registro de ontem às 23h BRT (02h UTC de hoje) conta como ontem, e "hoje" do painel não é confundido com UTC. Backend coberto por `hojeLocal` (Task 2 usa as datas do banco, que já são locais); painel conferido na Task 5.

---

### Task 1: `resumirAdesao` (regras puras)

**Files:**
- Create: `backend/src/services/adesao.ts`
- Test: `backend/tests/adesao.test.ts`

**Interfaces:**
- Produces:
  - `interface PesagemAdesao { data: string; peso_kg: number }`
  - `interface EntradaAdesao { agora: Date; hoje: string; criadoEm: Date; expirado: boolean; diasComKcal: string[]; ultimaRefeicaoEm: Date | null; pesagens: PesagemAdesao[]; pesoInicialKg: number | null }`
  - `type MotivoAtencao = 'sem_registro_48h' | 'baixa_adesao'`
  - `interface ResumoAdesao { dias_com_registro_7d: number; ultimo_registro_em: string | null; peso_atual_kg: number | null; peso_tendencia: 'subiu' | 'desceu' | 'estavel' | null; precisa_atencao: boolean; motivo: MotivoAtencao | null }`
  - `resumirAdesao(e: EntradaAdesao): ResumoAdesao`

- [ ] **Step 1: Escrever os testes que falham**

`backend/tests/adesao.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn(), rpc: vi.fn() })) }));

import { resumirAdesao, type EntradaAdesao } from '../src/services/adesao';

const AGORA = new Date('2026-11-09T15:00:00Z'); // 12:00 BRT
const HOJE = '2026-11-09';
const horasAtras = (h: number): Date => new Date(AGORA.getTime() - h * 3600_000);

function entrada(over: Partial<EntradaAdesao> = {}): EntradaAdesao {
  return {
    agora: AGORA,
    hoje: HOJE,
    criadoEm: horasAtras(24 * 30),
    expirado: false,
    diasComKcal: ['2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03'],
    ultimaRefeicaoEm: horasAtras(3),
    pesagens: [],
    pesoInicialKg: null,
    ...over,
  };
}

describe('resumirAdesao — adesão 7d', () => {
  it('conta só [hoje−7, hoje−1]; hoje e hoje−8 ficam fora', () => {
    const r = resumirAdesao(entrada({ diasComKcal: ['2026-11-09', '2026-11-08', '2026-11-02', '2026-11-01'] }));
    expect(r.dias_com_registro_7d).toBe(2);
  });
  it('data repetida conta uma vez', () => {
    expect(resumirAdesao(entrada({ diasComKcal: ['2026-11-08', '2026-11-08'] })).dias_com_registro_7d).toBe(1);
  });
  it('último registro sai em ISO', () => {
    expect(resumirAdesao(entrada()).ultimo_registro_em).toBe(horasAtras(3).toISOString());
    expect(resumirAdesao(entrada({ ultimaRefeicaoEm: null })).ultimo_registro_em).toBeNull();
  });
});

describe('resumirAdesao — atenção', () => {
  it('paciente regular não precisa de atenção', () => {
    const r = resumirAdesao(entrada());
    expect(r.precisa_atencao).toBe(false);
    expect(r.motivo).toBeNull();
  });
  it('48 h sem registrar → sem_registro_48h; 47 h não', () => {
    expect(resumirAdesao(entrada({ ultimaRefeicaoEm: horasAtras(48) })).motivo).toBe('sem_registro_48h');
    expect(resumirAdesao(entrada({ ultimaRefeicaoEm: horasAtras(47) })).motivo).toBeNull();
  });
  it('cadastrado hoje e nunca registrou: sem atenção', () => {
    const r = resumirAdesao(entrada({ criadoEm: horasAtras(10), ultimaRefeicaoEm: null, diasComKcal: [] }));
    expect(r.precisa_atencao).toBe(false);
  });
  it('cadastrado há 3 dias e nunca registrou: sem_registro_48h', () => {
    const r = resumirAdesao(entrada({ criadoEm: horasAtras(72), ultimaRefeicaoEm: null, diasComKcal: [] }));
    expect(r.motivo).toBe('sem_registro_48h');
  });
  it('≤ 2 de 7 dias com cadastro antigo → baixa_adesao; 3 dias não', () => {
    expect(resumirAdesao(entrada({ diasComKcal: ['2026-11-08', '2026-11-05'] })).motivo).toBe('baixa_adesao');
    expect(resumirAdesao(entrada({ diasComKcal: ['2026-11-08', '2026-11-05', '2026-11-03'] })).motivo).toBeNull();
  });
  it('baixa adesão não vale para cadastro com menos de 7 dias', () => {
    const r = resumirAdesao(entrada({ criadoEm: horasAtras(24 * 5), diasComKcal: ['2026-11-08'] }));
    expect(r.precisa_atencao).toBe(false);
  });
  it('os dois motivos → sem_registro_48h', () => {
    const r = resumirAdesao(entrada({ ultimaRefeicaoEm: horasAtras(24 * 5), diasComKcal: [] }));
    expect(r.motivo).toBe('sem_registro_48h');
  });
  it('plano expirado nunca entra em atenção', () => {
    const r = resumirAdesao(entrada({ expirado: true, ultimaRefeicaoEm: null, diasComKcal: [] }));
    expect(r.precisa_atencao).toBe(false);
    expect(r.motivo).toBeNull();
  });
});

describe('resumirAdesao — peso', () => {
  it('sem pesagem: peso e tendência nulos', () => {
    const r = resumirAdesao(entrada({ pesoInicialKg: 80 }));
    expect(r.peso_atual_kg).toBeNull();
    expect(r.peso_tendencia).toBeNull();
  });
  it('compara com a pesagem anterior', () => {
    const r = resumirAdesao(entrada({
      pesagens: [{ data: '2026-11-01', peso_kg: 79 }, { data: '2026-11-08', peso_kg: 78.4 }],
      pesoInicialKg: 70,
    }));
    expect(r.peso_atual_kg).toBe(78.4);
    expect(r.peso_tendencia).toBe('desceu');
  });
  it('uma pesagem só compara com o peso da entrevista', () => {
    const r = resumirAdesao(entrada({ pesagens: [{ data: '2026-11-08', peso_kg: 80 }], pesoInicialKg: 79 }));
    expect(r.peso_tendencia).toBe('subiu');
  });
  it('variação menor que 0,1 kg é estável', () => {
    const r = resumirAdesao(entrada({
      pesagens: [{ data: '2026-11-01', peso_kg: 78.4 }, { data: '2026-11-08', peso_kg: 78.45 }],
    }));
    expect(r.peso_tendencia).toBe('estavel');
  });
  it('uma pesagem e sem peso de entrevista: tendência nula', () => {
    const r = resumirAdesao(entrada({ pesagens: [{ data: '2026-11-08', peso_kg: 80 }] }));
    expect(r.peso_atual_kg).toBe(80);
    expect(r.peso_tendencia).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/adesao.test.ts`
Expected: FAIL — `Cannot find module '../src/services/adesao'`.

- [ ] **Step 3: Implementar**

`backend/src/services/adesao.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { somarDias } from '../utils/datas';

// I/O em lote (Task 2) usa este cliente.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export interface PesagemAdesao {
  data: string;
  peso_kg: number;
}

export interface EntradaAdesao {
  agora: Date;
  hoje: string;
  criadoEm: Date;
  expirado: boolean;
  diasComKcal: string[];
  ultimaRefeicaoEm: Date | null;
  pesagens: PesagemAdesao[];
  pesoInicialKg: number | null;
}

export type MotivoAtencao = 'sem_registro_48h' | 'baixa_adesao';

export interface ResumoAdesao {
  dias_com_registro_7d: number;
  ultimo_registro_em: string | null;
  peso_atual_kg: number | null;
  peso_tendencia: 'subiu' | 'desceu' | 'estavel' | null;
  precisa_atencao: boolean;
  motivo: MotivoAtencao | null;
}

// Mesmo limite do "Sumiu?" do bot (alertas.ts): painel e bot contam a mesma história.
const SEM_REGISTRO_MS = 48 * 3600_000;
const CADASTRO_MINIMO_BAIXA_ADESAO_MS = 7 * 24 * 3600_000;
const LIMIAR_BAIXA_ADESAO = 2;

export function resumirAdesao(e: EntradaAdesao): ResumoAdesao {
  // 7 dias completos: hoje não conta, pro paciente não parecer mal pela manhã.
  const inicio = somarDias(e.hoje, -7);
  const fim = somarDias(e.hoje, -1);
  const dias = new Set(e.diasComKcal.filter((d) => d >= inicio && d <= fim)).size;

  const agoraMs = e.agora.getTime();
  const referencia = e.ultimaRefeicaoEm ?? e.criadoEm;
  const semRegistro = agoraMs - referencia.getTime() >= SEM_REGISTRO_MS;
  // Paciente novo não é punido pelos dias antes de existir.
  const baixaAdesao =
    dias <= LIMIAR_BAIXA_ADESAO && agoraMs - e.criadoEm.getTime() >= CADASTRO_MINIMO_BAIXA_ADESAO_MS;
  // Expirado já tem card próprio (renovação); não polui a triagem.
  const motivo: MotivoAtencao | null = e.expirado
    ? null
    : semRegistro
      ? 'sem_registro_48h'
      : baixaAdesao
        ? 'baixa_adesao'
        : null;

  const n = e.pesagens.length;
  const ultima = n > 0 ? e.pesagens[n - 1] : null;
  const base = n >= 2 ? e.pesagens[n - 2].peso_kg : e.pesoInicialKg;
  let tendencia: ResumoAdesao['peso_tendencia'] = null;
  if (ultima && base !== null) {
    const delta = Math.round((ultima.peso_kg - base) * 10) / 10;
    tendencia = delta <= -0.1 ? 'desceu' : delta >= 0.1 ? 'subiu' : 'estavel';
  }

  return {
    dias_com_registro_7d: dias,
    ultimo_registro_em: e.ultimaRefeicaoEm ? e.ultimaRefeicaoEm.toISOString() : null,
    peso_atual_kg: ultima ? ultima.peso_kg : null,
    peso_tendencia: tendencia,
    precisa_atencao: motivo !== null,
    motivo,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/adesao.test.ts && npm run typecheck`
Expected: PASS (15 testes), typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/adesao.ts backend/tests/adesao.test.ts
git commit -m "feat(adesao): regras de adesão 7d, atenção e tendência de peso"
```

---

### Task 2: I/O em lote + rotas

**Files:**
- Modify: `backend/src/services/adesao.ts` (acrescentar no fim)
- Modify: `backend/src/routes/pacientes.ts` (import; select e resposta do `GET /`; nova rota `GET /:id/adesao` antes de `GET /:id/dieta`)
- Test: `backend/tests/adesao-io.test.ts`

**Interfaces:**
- Consumes: `resumirAdesao`, `ResumoAdesao`, `PesagemAdesao`, `supabase` (Task 1); `ultima_refeicao_por_paciente(ids uuid[]) → (paciente_id, ultima)` (PR #6); `obterMetas` de `./calculos`; `hojeLocal`, `somarDias`.
- Produces:
  - `interface PacienteParaAdesao { id: string; created_at: string; expirado: boolean; peso_inicial_kg: number | null }`
  - `carregarAdesaoLista(pacientes: PacienteParaAdesao[], agora?: Date): Promise<Map<string, ResumoAdesao> | null>`
  - `interface DiaAdesao { data: string; kcal: number; proteina_g: number; agua_ml: number }`
  - `interface FichaAdesao { metas: { kcal: number; proteina_g: number; agua_ml: number | null }; dias: DiaAdesao[]; pesagens: PesagemAdesao[]; peso_inicial_kg: number | null; resumo: ResumoAdesao }`
  - `obterFichaAdesao(pacienteId: string, agora?: Date): Promise<FichaAdesao | null>` (null = paciente não existe; erro de banco lança)
  - HTTP: `GET /api/pacientes` → cada item ganha `adesao: ResumoAdesao | null`; `GET /api/pacientes/:id/adesao` → `FichaAdesao` | 404 | 500.

- [ ] **Step 1: Escrever os testes que falham**

`backend/tests/adesao-io.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resultado = { data: unknown; error: null | { message: string } };

const { resultados } = vi.hoisted(() => ({ resultados: {} as Record<string, Resultado> }));

vi.mock('@supabase/supabase-js', () => {
  function chainPara(chave: string) {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gt', 'gte', 'lte', 'order', 'limit']) chain[m] = () => chain;
    const res = () => resultados[chave] ?? { data: [], error: null };
    chain.maybeSingle = () => Promise.resolve(res());
    chain.then = (resolve: (v: unknown) => unknown) => resolve(res());
    return chain;
  }
  return {
    createClient: vi.fn(() => ({
      from: (t: string) => chainPara(t),
      rpc: (fn: string) => chainPara(`rpc:${fn}`),
    })),
  };
});

import { carregarAdesaoLista, obterFichaAdesao } from '../src/services/adesao';
import { hojeLocal, somarDias } from '../src/utils/datas';

const ULTIMA = 'rpc:ultima_refeicao_por_paciente';
const hoje = hojeLocal();
const horasAtras = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString();

beforeEach(() => {
  for (const k of Object.keys(resultados)) delete resultados[k];
});

describe('carregarAdesaoLista', () => {
  const pacientes = [
    { id: 'p1', created_at: horasAtras(24 * 30), expirado: false, peso_inicial_kg: 80 },
    { id: 'p2', created_at: horasAtras(24 * 30), expirado: false, peso_inicial_kg: null },
  ];

  it('monta o resumo de cada paciente a partir das 3 fontes', async () => {
    resultados.registros_diarios = {
      data: [
        { paciente_id: 'p1', data: somarDias(hoje, -1) },
        { paciente_id: 'p1', data: somarDias(hoje, -2) },
        { paciente_id: 'p1', data: somarDias(hoje, -3) },
      ],
      error: null,
    };
    resultados[ULTIMA] = { data: [{ paciente_id: 'p1', ultima: horasAtras(3) }], error: null };
    resultados.pesagens = {
      data: [
        { paciente_id: 'p1', data: somarDias(hoje, -8), peso_kg: '79.00' },
        { paciente_id: 'p1', data: somarDias(hoje, -1), peso_kg: '78.40' },
      ],
      error: null,
    };

    const mapa = await carregarAdesaoLista(pacientes);
    expect(mapa).not.toBeNull();
    expect(mapa!.get('p1')).toMatchObject({
      dias_com_registro_7d: 3,
      peso_atual_kg: 78.4,
      peso_tendencia: 'desceu',
      precisa_atencao: false,
    });
    expect(mapa!.get('p2')).toMatchObject({
      dias_com_registro_7d: 0,
      ultimo_registro_em: null,
      precisa_atencao: true,
      motivo: 'sem_registro_48h',
    });
  });

  it('falha em qualquer fonte devolve null (lista segue sem adesão)', async () => {
    resultados[ULTIMA] = { data: null, error: { message: 'function does not exist' } };
    expect(await carregarAdesaoLista(pacientes)).toBeNull();
  });

  it('lista vazia devolve mapa vazio', async () => {
    const mapa = await carregarAdesaoLista([]);
    expect(mapa?.size).toBe(0);
  });
});

describe('obterFichaAdesao', () => {
  const paciente = {
    id: 'p1',
    created_at: horasAtras(24 * 30),
    ativo: true,
    data_expiracao: somarDias(hoje, 30),
    entrevista_dados: {
      metas_kcal: 2000, metas_proteina_g: 150, metas_carbo_g: 200, metas_gordura_g: 60,
      hidratacao_ml: 2500, peso_kg: 82.5,
    },
  };

  it('paciente inexistente devolve null', async () => {
    resultados.pacientes = { data: null, error: null };
    expect(await obterFichaAdesao('nao-existe')).toBeNull();
  });

  it('14 dias com zeros nos vazios, metas e peso inicial', async () => {
    resultados.pacientes = { data: paciente, error: null };
    resultados.registros_diarios = {
      data: [
        { data: somarDias(hoje, -1), kcal_consumido: '1850.00', proteina_g: '120.00', agua_ml: 2000 },
        { data: hoje, kcal_consumido: '600.00', proteina_g: '40.00', agua_ml: 500 },
      ],
      error: null,
    };
    resultados[ULTIMA] = { data: [{ paciente_id: 'p1', ultima: horasAtras(2) }], error: null };
    resultados.pesagens = { data: [{ data: somarDias(hoje, -1), peso_kg: '81.10' }], error: null };

    const ficha = await obterFichaAdesao('p1');
    expect(ficha).not.toBeNull();
    expect(ficha!.dias).toHaveLength(14);
    expect(ficha!.dias[0]).toEqual({ data: somarDias(hoje, -13), kcal: 0, proteina_g: 0, agua_ml: 0 });
    expect(ficha!.dias[12]).toEqual({ data: somarDias(hoje, -1), kcal: 1850, proteina_g: 120, agua_ml: 2000 });
    expect(ficha!.dias[13].data).toBe(hoje);
    expect(ficha!.metas).toEqual({ kcal: 2000, proteina_g: 150, agua_ml: 2500 });
    expect(ficha!.peso_inicial_kg).toBe(82.5);
    expect(ficha!.pesagens).toEqual([{ data: somarDias(hoje, -1), peso_kg: 81.1 }]);
    expect(ficha!.resumo.dias_com_registro_7d).toBe(1);
    expect(ficha!.resumo.peso_tendencia).toBe('desceu');
  });

  it('sem registros nem pesagens e sem metas na entrevista', async () => {
    resultados.pacientes = { data: { ...paciente, entrevista_dados: null }, error: null };
    const ficha = await obterFichaAdesao('p1');
    expect(ficha!.dias.every((d) => d.kcal === 0 && d.agua_ml === 0)).toBe(true);
    expect(ficha!.metas.kcal).toBeGreaterThan(0); // obterMetas cai no TDEE padrão
    expect(ficha!.metas.agua_ml).toBeNull();
    expect(ficha!.peso_inicial_kg).toBeNull();
    expect(ficha!.pesagens).toEqual([]);
  });

  it('erro de banco lança', async () => {
    resultados.pacientes = { data: null, error: { message: 'boom' } };
    await expect(obterFichaAdesao('p1')).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/adesao-io.test.ts`
Expected: FAIL — `carregarAdesaoLista` / `obterFichaAdesao` não exportados.

- [ ] **Step 3: Implementar o I/O**

No topo de `adesao.ts`, trocar o import de datas e acrescentar `obterMetas`:

```ts
import { hojeLocal, somarDias } from '../utils/datas';
import { obterMetas } from './calculos';
```

Acrescentar no fim de `adesao.ts`:

```ts
const JANELA_PESAGENS_DIAS = 90;
const DIAS_FICHA = 14;

export interface PacienteParaAdesao {
  id: string;
  created_at: string;
  expirado: boolean;
  peso_inicial_kg: number | null;
}

type Linha = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

async function ultimaRefeicaoPorPaciente(ids: string[]): Promise<Map<string, Date>> {
  const { data, error } = await supabase.rpc('ultima_refeicao_por_paciente', { ids });
  if (error) throw new Error(error.message);
  const mapa = new Map<string, Date>();
  for (const r of (data ?? []) as Linha[]) {
    if (r.ultima) mapa.set(String(r.paciente_id), new Date(String(r.ultima)));
  }
  return mapa;
}

function agruparPesagens(linhas: Linha[]): Map<string, PesagemAdesao[]> {
  const mapa = new Map<string, PesagemAdesao[]>();
  for (const r of linhas) {
    const id = String(r.paciente_id);
    const lista = mapa.get(id) ?? [];
    lista.push({ data: String(r.data), peso_kg: num(r.peso_kg) });
    mapa.set(id, lista);
  }
  return mapa;
}

// Uma consulta por fonte pro lote todo. Registros (≤ 7/paciente) e pesagens cabem no
// max_rows (1000) do PostgREST até ~140 pacientes — folga para single-tenant.
// Falha → null: a lista de pacientes sai sem adesão em vez de quebrar.
export async function carregarAdesaoLista(
  pacientes: PacienteParaAdesao[],
  agora: Date = new Date(),
): Promise<Map<string, ResumoAdesao> | null> {
  if (pacientes.length === 0) return new Map();
  const ids = pacientes.map((p) => p.id);
  const hoje = hojeLocal();
  try {
    const [regs, ultimas, pesos] = await Promise.all([
      supabase
        .from('registros_diarios')
        .select('paciente_id, data')
        .in('paciente_id', ids)
        .gt('kcal_consumido', 0)
        .gte('data', somarDias(hoje, -7))
        .lte('data', somarDias(hoje, -1)),
      ultimaRefeicaoPorPaciente(ids),
      supabase
        .from('pesagens')
        .select('paciente_id, data, peso_kg')
        .in('paciente_id', ids)
        .gte('data', somarDias(hoje, -JANELA_PESAGENS_DIAS))
        .order('data', { ascending: true }),
    ]);
    if (regs.error) throw new Error(regs.error.message);
    if (pesos.error) throw new Error(pesos.error.message);

    const diasPorPaciente = new Map<string, string[]>();
    for (const r of (regs.data ?? []) as Linha[]) {
      const id = String(r.paciente_id);
      diasPorPaciente.set(id, [...(diasPorPaciente.get(id) ?? []), String(r.data)]);
    }
    const pesagensPorPaciente = agruparPesagens((pesos.data ?? []) as Linha[]);

    const resultado = new Map<string, ResumoAdesao>();
    for (const p of pacientes) {
      resultado.set(
        p.id,
        resumirAdesao({
          agora,
          hoje,
          criadoEm: new Date(p.created_at),
          expirado: p.expirado,
          diasComKcal: diasPorPaciente.get(p.id) ?? [],
          ultimaRefeicaoEm: ultimas.get(p.id) ?? null,
          pesagens: pesagensPorPaciente.get(p.id) ?? [],
          pesoInicialKg: p.peso_inicial_kg,
        }),
      );
    }
    return resultado;
  } catch (err) {
    console.error('[adesao] Falha ao carregar adesão da lista (seguindo sem):', err);
    return null;
  }
}

export interface DiaAdesao {
  data: string;
  kcal: number;
  proteina_g: number;
  agua_ml: number;
}

export interface FichaAdesao {
  metas: { kcal: number; proteina_g: number; agua_ml: number | null };
  dias: DiaAdesao[];
  pesagens: PesagemAdesao[];
  peso_inicial_kg: number | null;
  resumo: ResumoAdesao;
}

export async function obterFichaAdesao(
  pacienteId: string,
  agora: Date = new Date(),
): Promise<FichaAdesao | null> {
  const { data: paciente, error } = await supabase
    .from('pacientes')
    .select('id, created_at, ativo, data_expiracao, entrevista_dados')
    .eq('id', pacienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!paciente) return null;

  const hoje = hojeLocal();
  const inicio = somarDias(hoje, -(DIAS_FICHA - 1));
  const [regs, ultimas, pesos] = await Promise.all([
    supabase
      .from('registros_diarios')
      .select('data, kcal_consumido, proteina_g, agua_ml')
      .eq('paciente_id', pacienteId)
      .gte('data', inicio)
      .lte('data', hoje),
    ultimaRefeicaoPorPaciente([pacienteId]),
    supabase
      .from('pesagens')
      .select('paciente_id, data, peso_kg')
      .eq('paciente_id', pacienteId)
      .gte('data', somarDias(hoje, -JANELA_PESAGENS_DIAS))
      .order('data', { ascending: true }),
  ]);
  if (regs.error) throw new Error(regs.error.message);
  if (pesos.error) throw new Error(pesos.error.message);

  const porData = new Map<string, Linha>();
  for (const r of (regs.data ?? []) as Linha[]) porData.set(String(r.data), r);
  const dias: DiaAdesao[] = [];
  for (let i = 0; i < DIAS_FICHA; i++) {
    const data = somarDias(inicio, i);
    const r = porData.get(data);
    dias.push({
      data,
      kcal: r ? num(r.kcal_consumido) : 0,
      proteina_g: r ? num(r.proteina_g) : 0,
      agua_ml: r ? num(r.agua_ml) : 0,
    });
  }

  const p = paciente as Linha;
  const entrevista = (p.entrevista_dados ?? {}) as Record<string, unknown>;
  const metas = obterMetas(entrevista);
  const pesoInicialKg = num(entrevista['peso_kg']) || null;
  const pesagens = agruparPesagens((pesos.data ?? []) as Linha[]).get(pacienteId) ?? [];
  const expirado = !p.ativo || new Date(String(p.data_expiracao)) < agora;

  return {
    metas: { kcal: metas.kcal, proteina_g: metas.proteina_g, agua_ml: metas.agua_ml ?? null },
    dias,
    pesagens,
    peso_inicial_kg: pesoInicialKg,
    resumo: resumirAdesao({
      agora,
      hoje,
      criadoEm: new Date(String(p.created_at)),
      expirado,
      diasComKcal: dias.filter((d) => d.kcal > 0).map((d) => d.data),
      ultimaRefeicaoEm: ultimas.get(pacienteId) ?? null,
      pesagens,
      pesoInicialKg,
    }),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/adesao-io.test.ts tests/adesao.test.ts`
Expected: PASS (22 testes).

- [ ] **Step 5: Ligar as rotas**

Em `backend/src/routes/pacientes.ts`, junto dos imports de serviços:

```ts
import { carregarAdesaoLista, obterFichaAdesao } from '../services/adesao';
```

No `GET /`, trocar o select:

```ts
    .select('id, nome, whatsapp, plano, data_expiracao, ativo, created_at, peso_inicial:entrevista_dados->peso_kg')
```

E trocar o fim do handler (de `const lista = (pacientes ?? []).map((p) => ({` até `res.json(lista);`) por:

```ts
  const lista = (pacientes ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    whatsapp: p.whatsapp,
    plano: p.plano,
    data_expiracao: p.data_expiracao,
    ativo: p.ativo,
    created_at: p.created_at,
    status: calcularStatus(p),
    rag_status: ragStatusPorPaciente.get(p.id) ?? 'sem_dieta',
  }));

  const adesao = await carregarAdesaoLista(
    (pacientes ?? []).map((p, i) => ({
      id: p.id,
      created_at: p.created_at,
      expirado: lista[i].status === 'expirado',
      peso_inicial_kg: Number(p.peso_inicial) || null,
    })),
  );

  res.json(lista.map((p) => ({ ...p, adesao: adesao?.get(p.id) ?? null })));
```

Antes de `pacientesRouter.get('/:id/dieta', ...)`:

```ts
pacientesRouter.get('/:id/adesao', async (req: Request, res: Response) => {
  try {
    const ficha = await obterFichaAdesao(req.params.id);
    if (!ficha) {
      res.status(404).json({ error: 'Paciente não encontrado' });
      return;
    }
    res.json(ficha);
  } catch (err) {
    console.error('[pacientes] Erro ao montar ficha de adesão:', err);
    res.status(500).json({ error: 'Falha ao carregar a adesão do paciente' });
  }
});
```

- [ ] **Step 6: Suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: tudo verde. Se o typecheck reclamar de `p.peso_inicial` (tipo inferido do select com `->`), tipar a linha com `(p as { peso_inicial?: unknown }).peso_inicial`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/adesao.ts backend/src/routes/pacientes.ts backend/tests/adesao-io.test.ts
git commit -m "feat(adesao): resumo em lote na lista de pacientes e rota da ficha"
```

---

### Task 3: Lista do painel — card, colunas, filtro

**Files:**
- Create: `nutrichat-painel/src/lib/adesao.ts`
- Create: `nutrichat-painel/src/components/AdesaoIndicadores.tsx`
- Modify: `nutrichat-painel/src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: HTTP `GET /api/pacientes` com `adesao: ResumoAdesao | null` (Task 2).
- Produces:
  - `lib/adesao.ts`: tipos `ResumoAdesao`, `MotivoAtencao`, `DiaAdesao`, `FichaAdesao` (espelho do backend); `formatarUltimoRegistro(iso: string | null, agora?: Date): string`; `formatarKg(n: number): string`; `SETA_TENDENCIA: Record<'subiu'|'desceu'|'estavel', string>`; `MOTIVO_LABEL: Record<MotivoAtencao, string>`.
  - `components/AdesaoIndicadores.tsx`: `BarraAdesao({ dias }: { dias: number })`, `UltimoRegistro({ adesao }: { adesao: ResumoAdesao | null })`, `PesoResumo({ adesao }: { adesao: ResumoAdesao | null })`.
  - `Dashboard.tsx` passa a ter estado `fichaPaciente: { id: string; nome: string } | null` (usado na Task 4).

Sem testes automatizados no painel (spec): o gate da task é `npm run build` + `npm run lint`.

- [ ] **Step 1: `lib/adesao.ts`**

```ts
// Espelho dos tipos de backend/src/services/adesao.ts.
export type MotivoAtencao = 'sem_registro_48h' | 'baixa_adesao';
export type TendenciaPeso = 'subiu' | 'desceu' | 'estavel';

export interface ResumoAdesao {
  dias_com_registro_7d: number;
  ultimo_registro_em: string | null;
  peso_atual_kg: number | null;
  peso_tendencia: TendenciaPeso | null;
  precisa_atencao: boolean;
  motivo: MotivoAtencao | null;
}

export interface DiaAdesao {
  data: string;
  kcal: number;
  proteina_g: number;
  agua_ml: number;
}

export interface FichaAdesao {
  metas: { kcal: number; proteina_g: number; agua_ml: number | null };
  dias: DiaAdesao[];
  pesagens: { data: string; peso_kg: number }[];
  peso_inicial_kg: number | null;
  resumo: ResumoAdesao;
}

export const MOTIVO_LABEL: Record<MotivoAtencao, string> = {
  sem_registro_48h: 'Sem registrar há 2 dias ou mais',
  baixa_adesao: 'Registrou 2 dias ou menos na semana',
};

export const SETA_TENDENCIA: Record<TendenciaPeso, string> = { desceu: '↓', subiu: '↑', estavel: '→' };

export function formatarKg(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

// Dias de calendário no fuso do navegador (o nutricionista está no Brasil).
export function formatarUltimoRegistro(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const meiaNoite = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((meiaNoite(agora) - meiaNoite(d)) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

// "2026-11-03" → "03/11"
export function formatarDiaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
```

- [ ] **Step 2: `components/AdesaoIndicadores.tsx`**

```tsx
import { formatarKg, formatarUltimoRegistro, MOTIVO_LABEL, SETA_TENDENCIA, type ResumoAdesao } from '../lib/adesao';

const traco = <span style={{ color: 'var(--color-text-muted)' }}>—</span>;

export function BarraAdesao({ dias }: { dias: number }) {
  const cor = dias >= 5 ? 'var(--color-success)' : dias >= 3 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <span className="inline-flex items-center gap-2" title={`${dias} de 7 dias com registro`}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="w-2 h-3.5 rounded-sm"
            style={{ background: i < dias ? cor : 'var(--color-border-subtle)' }}
          />
        ))}
      </span>
      <span className="tabular-nums text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {dias}/7
      </span>
    </span>
  );
}

export function UltimoRegistro({ adesao }: { adesao: ResumoAdesao | null }) {
  if (!adesao) return traco;
  const alerta = adesao.motivo === 'sem_registro_48h';
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ color: alerta ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}
      title={adesao.motivo ? MOTIVO_LABEL[adesao.motivo] : undefined}
    >
      {formatarUltimoRegistro(adesao.ultimo_registro_em)}
      {alerta && <span aria-label="precisa de atenção">⚠</span>}
    </span>
  );
}

export function PesoResumo({ adesao }: { adesao: ResumoAdesao | null }) {
  if (!adesao || adesao.peso_atual_kg === null) return traco;
  const seta = adesao.peso_tendencia ? SETA_TENDENCIA[adesao.peso_tendencia] : '';
  return (
    <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
      {formatarKg(adesao.peso_atual_kg)} kg {seta && <span aria-hidden>{seta}</span>}
    </span>
  );
}
```

- [ ] **Step 3: `Dashboard.tsx` — tipos, estado, resumo, filtro, ordenação**

Imports (junto dos outros):

```ts
import type { ResumoAdesao } from '../lib/adesao';
import { BarraAdesao, UltimoRegistro, PesoResumo } from '../components/AdesaoIndicadores';
```

Em `interface Paciente`, acrescentar `adesao: ResumoAdesao | null;`.

Trocar:

```ts
type OrdemCampo = 'nome' | 'data_expiracao' | 'status' | 'rag_status';
```
por
```ts
type OrdemCampo = 'nome' | 'data_expiracao' | 'status' | 'rag_status' | 'adesao';
```
e
```ts
type FiltroStatus = 'todos' | 'ativo' | 'expirando' | 'expirado';
```
por
```ts
type FiltroStatus = 'todos' | 'ativo' | 'expirando' | 'expirado' | 'atencao';
```

Depois de `const [ultimaAtualizacao, ...]`:

```ts
  const [fichaPaciente, setFichaPaciente] = useState<{ id: string; nome: string } | null>(null);
```

No `useMemo` de `resumo`: declarar `let atencao = 0;`, dentro do `for` acrescentar `if (p.adesao?.precisa_atencao) atencao++;` e retornar `{ total, ativos, expirando, expirados, atencao }`.

No filtro, trocar:

```ts
      if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;
```
por
```ts
      if (filtroStatus === 'atencao') {
        if (!p.adesao?.precisa_atencao) return false;
      } else if (filtroStatus !== 'todos' && p.status !== filtroStatus) {
        return false;
      }
```

No `switch (ordemCampo)`, depois do `case 'rag_status'`:

```ts
        case 'adesao':
          // Sem dado (null) vai pro fim na ordem crescente de "quem precisa de atenção".
          diff = (a.adesao?.dias_com_registro_7d ?? 99) - (b.adesao?.dias_com_registro_7d ?? 99);
          break;
```

O atalho "/" deve respeitar a ficha aberta: no `useEffect` do atalho, trocar `if (e.key !== '/' || modalAberto) return;` por `if (e.key !== '/' || modalAberto || fichaPaciente) return;` e a lista de dependências `[modalAberto]` por `[modalAberto, fichaPaciente]`.

- [ ] **Step 4: Card "Atenção"**

Trocar `<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">` por `<div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">` e inserir como **primeiro** filho:

```tsx
          <div className="col-span-2 md:col-span-1">
            <SummaryCard
              label="Atenção"
              value={resumo.atencao}
              hint="Sem registrar há 2+ dias ou adesão baixa"
              tone={resumo.atencao > 0 ? 'danger' : 'neutral'}
              active={filtroStatus === 'atencao'}
              onClick={() => setFiltroStatus('atencao')}
            />
          </div>
```

- [ ] **Step 5: Tabela desktop**

`min-w-[760px]` → `min-w-[1080px]`. No `<thead>`, logo depois do `SortableTh` de Nome:

```tsx
                    <SortableTh ativo={ordemCampo === 'adesao'} onClick={() => alternarOrdem('adesao')} seta={setaOrdem('adesao')}>
                      Adesão 7d
                    </SortableTh>
                    <Th>Último registro</Th>
                    <Th>Peso</Th>
```

Na linha, trocar a célula do nome:

```tsx
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {p.nome}
                      </td>
```
por
```tsx
                      <td className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => setFichaPaciente({ id: p.id, nome: p.nome })}
                          className="underline-offset-4 hover:underline cursor-pointer text-left"
                          style={{ color: 'var(--color-text-primary)' }}
                          title="Ver adesão"
                        >
                          {p.nome}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {p.adesao ? <BarraAdesao dias={p.adesao.dias_com_registro_7d} /> : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <UltimoRegistro adesao={p.adesao} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <PesoResumo adesao={p.adesao} />
                      </td>
```

Na célula de Ações, trocar o botão único por:

```tsx
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setFichaPaciente({ id: p.id, nome: p.nome })}>
                            Adesão
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)}>
                            Editar
                          </Button>
                        </div>
                      </td>
```

- [ ] **Step 6: Cards do celular**

O card hoje é um `<button>` inteiro que abre a edição; com duas ações ele vira `<div>` com dois botões. Trocar o conteúdo de `<li key={p.id}>…</li>` por:

```tsx
                <li key={p.id}>
                  <div
                    className="bg-white rounded-2xl p-4"
                    style={{ border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--shadow-card)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {p.nome}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          {formatarWhatsappBR(p.whatsapp)}
                        </p>
                      </div>
                      <StatusBadge status={p.status} title={tituloStatus(p.status)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <span>{PLANO_LABELS[p.plano as keyof typeof PLANO_LABELS] ?? p.plano}</span>
                      <span aria-hidden style={{ color: 'var(--color-border-subtle)' }}>•</span>
                      <span>Expira em {formatarDataBR(p.data_expiracao)}</span>
                    </div>
                    {p.adesao && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        <BarraAdesao dias={p.adesao.dias_com_registro_7d} />
                        <UltimoRegistro adesao={p.adesao} />
                        <PesoResumo adesao={p.adesao} />
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <RagBadge status={p.rag_status} />
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setFichaPaciente({ id: p.id, nome: p.nome })} className="min-h-[44px]">
                          Adesão
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)} className="min-h-[44px]" aria-label={`Editar ${p.nome}`}>
                          Editar
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
```

(Conferir em `Button.tsx` que `className` é repassado; se não for, envolver os botões num `div` com `min-h-[44px]`.)

- [ ] **Step 7: Build + lint**

Run (em `nutrichat-painel/`): `npm run build && npm run lint`
Expected: build ok, lint sem erros. `fichaPaciente` ainda sem uso de leitura além do atalho — ok; a Task 4 renderiza o modal.

- [ ] **Step 8: Commit**

```bash
git add nutrichat-painel/src/lib/adesao.ts nutrichat-painel/src/components/AdesaoIndicadores.tsx nutrichat-painel/src/pages/Dashboard.tsx
git commit -m "feat(painel): card de atenção e colunas de adesão na lista"
```

---

### Task 4: Ficha do paciente (`AdesaoModal`)

**Files:**
- Create: `nutrichat-painel/src/components/AdesaoModal.tsx`
- Modify: `nutrichat-painel/src/pages/Dashboard.tsx` (render do modal)

**Interfaces:**
- Consumes: `FichaAdesao`, `formatarKg`, `formatarDiaMes`, `formatarUltimoRegistro`, `MOTIVO_LABEL` (Task 3); `BarraAdesao` (Task 3); HTTP `GET /api/pacientes/:id/adesao` (Task 2); `apiFetch`.
- Produces: `AdesaoModal({ paciente, onClose }: { paciente: { id: string; nome: string }; onClose: () => void })`.

**Antes de escrever:** carregar a skill `dataviz` (regra do ambiente para qualquer gráfico) e ajustar cores/rotulagem às recomendações dela, mantendo os tokens `--color-*` do painel.

- [ ] **Step 1: Escrever o componente**

`nutrichat-painel/src/components/AdesaoModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { BarraAdesao } from './AdesaoIndicadores';
import {
  formatarDiaMes,
  formatarKg,
  formatarUltimoRegistro,
  MOTIVO_LABEL,
  type DiaAdesao,
  type FichaAdesao,
} from '../lib/adesao';

interface AdesaoModalProps {
  paciente: { id: string; nome: string };
  onClose: () => void;
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; msg: string } | { tipo: 'ok'; ficha: FichaAdesao };

export function AdesaoModal({ paciente, onClose }: AdesaoModalProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelado = false;
    // setState fora do corpo síncrono do efeito (regra react-hooks).
    void Promise.resolve().then(async () => {
      try {
        const res = await apiFetch(`/api/pacientes/${paciente.id}/adesao`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`);
        }
        const ficha = (await res.json()) as FichaAdesao;
        if (!cancelado) setEstado({ tipo: 'ok', ficha });
      } catch (err) {
        console.error('[adesao] Erro ao carregar ficha:', err);
        if (!cancelado) setEstado({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro desconhecido' });
      }
    });
    return () => {
      cancelado = true;
    };
  }, [paciente.id]);

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 sm:p-4"
      style={{ background: 'rgba(35, 64, 16, 0.45)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adesao-title"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 sm:px-6 py-4 bg-white z-10"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          <div className="min-w-0">
            <h2 id="adesao-title" className="font-display text-2xl leading-tight" style={{ color: 'var(--color-floresta)' }}>
              Adesão
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
              {paciente.nome}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar (ESC)"
            className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full text-2xl cursor-pointer hover:bg-[color:var(--color-bg-muted)] transition"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ×
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 flex flex-col gap-6">
          {estado.tipo === 'carregando' && (
            <div className="h-48 rounded-2xl animate-pulse" style={{ background: 'var(--color-bg-muted)' }} aria-busy="true" />
          )}
          {estado.tipo === 'erro' && (
            <p className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>
              <strong>Não foi possível carregar a adesão.</strong> {estado.msg}
            </p>
          )}
          {estado.tipo === 'ok' && <ConteudoFicha ficha={estado.ficha} />}
        </div>
      </div>
    </div>
  );
}

function ConteudoFicha({ ficha }: { ficha: FichaAdesao }) {
  const { resumo } = ficha;
  const semRegistro = ficha.dias.every((d) => d.kcal === 0 && d.agua_ml === 0);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <BarraAdesao dias={resumo.dias_com_registro_7d} />
        <span>Último registro: <strong>{formatarUltimoRegistro(resumo.ultimo_registro_em)}</strong></span>
        {resumo.motivo && (
          <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>
            ⚠ {MOTIVO_LABEL[resumo.motivo]}
          </span>
        )}
      </div>

      <Secao titulo="Calorias — últimos 14 dias" subtitulo={`Meta ${Math.round(ficha.metas.kcal)} kcal/dia`}>
        {semRegistro ? (
          <Vazio texto="Nenhum registro nos últimos 14 dias. Assim que o paciente mandar refeições pelo WhatsApp, elas aparecem aqui." />
        ) : (
          <GraficoKcal dias={ficha.dias} meta={ficha.metas.kcal} />
        )}
      </Secao>

      {!semRegistro && (
        <Secao titulo="Proteína e água" subtitulo="% da meta por dia">
          <FaixaMeta rotulo="Proteína" dias={ficha.dias} valor={(d) => d.proteina_g} meta={ficha.metas.proteina_g} unidade="g" />
          {ficha.metas.agua_ml ? (
            <FaixaMeta rotulo="Água" dias={ficha.dias} valor={(d) => d.agua_ml} meta={ficha.metas.agua_ml} unidade="ml" />
          ) : (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>Meta de água não definida na entrevista.</p>
          )}
        </Secao>
      )}

      <Secao titulo="Peso" subtitulo="Últimos 90 dias">
        <GraficoPeso pesagens={ficha.pesagens} inicial={ficha.peso_inicial_kg} />
      </Secao>
    </>
  );
}

function Secao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{titulo}</h3>
        {subtitulo && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{subtitulo}</span>}
      </div>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="text-sm px-4 py-6 rounded-xl text-center" style={{ background: 'var(--color-bg-muted)', color: 'var(--color-text-muted)' }}>
      {texto}
    </p>
  );
}

// Cor por faixa da meta: abaixo (<90%), dentro (90–110%), acima (>110%).
function corPorMeta(pct: number): string {
  if (pct > 110) return 'var(--color-warning)';
  if (pct >= 90) return 'var(--color-success)';
  return 'var(--color-claro)';
}

function GraficoKcal({ dias, meta }: { dias: DiaAdesao[]; meta: number }) {
  const W = 560;
  const H = 180;
  const topo = 12;
  const base = H - 24;
  const maxValor = Math.max(meta * 1.3, ...dias.map((d) => d.kcal), 1);
  const y = (v: number) => base - (v / maxValor) * (base - topo);
  const passo = W / dias.length;
  const largura = passo * 0.62;
  const ultimo = dias.length - 1;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Calorias por dia nos últimos 14 dias, comparadas à meta">
        <line x1={0} x2={W} y1={y(meta)} y2={y(meta)} stroke="var(--color-floresta)" strokeDasharray="4 4" strokeWidth={1} />
        <text x={W - 4} y={y(meta) - 4} textAnchor="end" fontSize={11} fill="var(--color-floresta)">meta</text>
        {dias.map((d, i) => {
          const x = i * passo + (passo - largura) / 2;
          const pct = meta > 0 ? (d.kcal / meta) * 100 : 0;
          const hoje = i === ultimo;
          return (
            <g key={d.data} opacity={hoje ? 0.5 : 1}>
              <title>{`${formatarDiaMes(d.data)}${hoje ? ' (hoje, parcial)' : ''}: ${Math.round(d.kcal)} kcal`}</title>
              {d.kcal > 0 ? (
                <rect x={x} y={y(d.kcal)} width={largura} height={base - y(d.kcal)} rx={3} fill={corPorMeta(pct)} />
              ) : (
                <rect x={x} y={base - 3} width={largura} height={3} rx={1.5} fill="var(--color-border-subtle)" />
              )}
              {(i % 2 === 1 || hoje) && (
                <text x={x + largura / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
                  {hoje ? 'hoje' : formatarDiaMes(d.data)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
        <Legenda cor="var(--color-claro)" texto="abaixo de 90%" />
        <Legenda cor="var(--color-success)" texto="na meta (90–110%)" />
        <Legenda cor="var(--color-warning)" texto="acima de 110%" />
        <span>Hoje aparece mais claro: o dia ainda não acabou.</span>
      </figcaption>
    </figure>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: cor }} aria-hidden />
      {texto}
    </span>
  );
}

function FaixaMeta({
  rotulo,
  dias,
  valor,
  meta,
  unidade,
}: {
  rotulo: string;
  dias: DiaAdesao[];
  valor: (d: DiaAdesao) => number;
  meta: number;
  unidade: string;
}) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <span className="w-16 shrink-0 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{rotulo}</span>
      <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
        {dias.map((d, i) => {
          const v = valor(d);
          const pct = meta > 0 ? Math.round((v / meta) * 100) : 0;
          return (
            <span
              key={d.data}
              className="h-6 rounded-sm"
              title={`${formatarDiaMes(d.data)}: ${Math.round(v)} ${unidade} (${pct}% da meta)`}
              style={{
                background: v > 0 ? corPorMeta(pct) : 'transparent',
                border: v > 0 ? 'none' : '1px solid var(--color-border-subtle)',
                opacity: i === dias.length - 1 ? 0.5 : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function GraficoPeso({ pesagens, inicial }: { pesagens: { data: string; peso_kg: number }[]; inicial: number | null }) {
  if (pesagens.length === 0) {
    return <Vazio texto={'Sem pesagens ainda. O paciente pode mandar "pesei 78,5" no WhatsApp.'} />;
  }
  const primeiro = inicial ?? pesagens[0].peso_kg;
  const atual = pesagens[pesagens.length - 1].peso_kg;
  const delta = Math.round((atual - primeiro) * 10) / 10;
  const textoDelta = delta === 0 ? 'sem variação' : `${delta > 0 ? '+' : '−'}${formatarKg(Math.abs(delta))} kg`;

  const W = 560;
  const H = 140;
  const pad = 16;
  const valores = pesagens.map((p) => p.peso_kg);
  const min = Math.min(...valores, primeiro) - 0.5;
  const max = Math.max(...valores, primeiro) + 0.5;
  const t0 = new Date(pesagens[0].data).getTime();
  const t1 = new Date(pesagens[pesagens.length - 1].data).getTime();
  const x = (iso: string) => (t1 === t0 ? W / 2 : pad + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - 2 * pad));
  const y = (v: number) => pad + ((max - v) / (max - min)) * (H - 2 * pad);
  const pontos = pesagens.map((p) => `${x(p.data)},${y(p.peso_kg)}`).join(' ');

  return (
    <figure>
      <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        <strong className="tabular-nums">{formatarKg(primeiro)} → {formatarKg(atual)} kg</strong> ({textoDelta}
        {inicial !== null ? ' desde a entrevista' : ' no período'})
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Peso de ${formatarKg(primeiro)} para ${formatarKg(atual)} kg`}>
        {inicial !== null && (
          <>
            <line x1={0} x2={W} y1={y(inicial)} y2={y(inicial)} stroke="var(--color-border-subtle)" strokeDasharray="4 4" />
            <text x={4} y={y(inicial) - 4} fontSize={11} fill="var(--color-text-muted)">entrevista {formatarKg(inicial)}</text>
          </>
        )}
        {pesagens.length > 1 && (
          <polyline points={pontos} fill="none" stroke="var(--color-medio)" strokeWidth={2} strokeLinejoin="round" />
        )}
        {pesagens.map((p) => (
          <circle key={p.data} cx={x(p.data)} cy={y(p.peso_kg)} r={4} fill="var(--color-floresta)">
            <title>{`${formatarDiaMes(p.data)}: ${formatarKg(p.peso_kg)} kg`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}
```

- [ ] **Step 2: Renderizar no Dashboard**

Em `Dashboard.tsx`, import:

```ts
import { AdesaoModal } from '../components/AdesaoModal';
```

Logo depois do bloco `{modalAberto && (<PacienteModal … />)}`:

```tsx
      {fichaPaciente && <AdesaoModal paciente={fichaPaciente} onClose={() => setFichaPaciente(null)} />}
```

O `onClose` inline muda a cada render e reinstala o listener de Esc no modal — inofensivo, mas se o lint (`react-hooks`) reclamar, usar `const fecharFicha = useCallback(() => setFichaPaciente(null), []);`.

- [ ] **Step 3: Build + lint**

Run (em `nutrichat-painel/`): `npm run build && npm run lint`
Expected: build ok, lint sem erros.

- [ ] **Step 4: Commit**

```bash
git add nutrichat-painel/src/components/AdesaoModal.tsx nutrichat-painel/src/pages/Dashboard.tsx
git commit -m "feat(painel): ficha de adesão com calorias, proteína, água e peso"
```

---

### Task 5: Verificação local ponta a ponta

**Files:** nenhum versionado (seed descartável no scratchpad; memória do projeto).

- [ ] **Step 1: Suite completa**

Run: `cd backend && npx vitest run && npm run typecheck`; `cd nutrichat-painel && npm run build && npm run lint`
Expected: tudo verde; anotar a contagem de testes.

- [ ] **Step 2: Dados de demonstração (Supabase local)**

Supabase local precisa ter a migration do PR #6 (`pesagens` + RPC) — já aplicada em 2026-11-09; conferir com `docker exec supabase_db_nutri_fit psql -U postgres -d postgres -tAc "select to_regclass('public.pesagens'), to_regproc('ultima_refeicao_por_paciente')"`.

Rodar `node backend/agentes-teste/scripts/seed-painel.mjs` e um seed descartável (SQL no scratchpad, aplicado com `docker exec -i supabase_db_nutri_fit psql …`) que, para 3 pacientes ativos do seed, cria:
- A — 6 de 7 dias com `registros_diarios` + refeição há 3 h + 4 pesagens descendo;
- B — último registro há 4 dias, 1 de 7 dias (deve cair em Atenção, ⚠);
- C — 2 de 7 dias com refeição ontem e cadastro antigo (Atenção por baixa adesão).
Anotar os INSERTs para apagar no fim.

- [ ] **Step 3: Subir e olhar**

- Backend: `node backend/agentes-teste/scripts/backend-local.mjs` (porta 3101).
- Painel: em `nutrichat-painel/`, `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<de backend/.env.test> VITE_BACKEND_URL=http://localhost:3101 npm run dev` (o `.env.local` aponta pra PRODUÇÃO — as variáveis exportadas vencem).
- Pelo navegador (claude-in-chrome), logado com o usuário do seed: conferir card Atenção = 2 e filtro; colunas; ordenação por adesão; ficha de A (barras, faixa, peso), de B (⚠ + motivo) e de um paciente sem dados (estados vazios); largura 360 px (cards + ficha). Esc fecha a ficha.

- [ ] **Step 4: Limpar e registrar**

Apagar os dados do seed descartável; parar backend e vite. Criar `memory/painel_adesao_2026_11_09.md` + linha no `MEMORY.md` (branch empilhada no PR #4, commits, testes, o que falta: merge do #4 antes deste PR). graphify é atualizado pelo hook de commit.
