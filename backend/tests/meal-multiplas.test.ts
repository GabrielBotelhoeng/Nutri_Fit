import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mesmo esquema de preparo.test.ts — mocks hoisted ANTES dos imports do
// servico. meal.ts instancia Supabase/Anthropic no top-level.
const { insertSpy, rpcSpy, claudeState, supabaseMock } = vi.hoisted(() => {
  const ins = vi.fn();
  const rpc = vi.fn();
  const claude: { text: string } = { text: '{}' };
  return {
    insertSpy: ins,
    rpcSpy: rpc,
    claudeState: claude,
    supabaseMock: {
      from: vi.fn(() => ({
        insert: vi.fn((row: unknown) => {
          ins(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: `ref-${ins.mock.calls.length}`, registrado_em: new Date().toISOString() },
                error: null,
              })),
            })),
          };
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
            gte: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        })),
      })),
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        rpc(name, args);
        return { error: null };
      }),
    },
  };
});

const { sendTextSpy, atualizarEstadoSpy, estadoState } = vi.hoisted(() => ({
  sendTextSpy: vi.fn(async () => undefined),
  atualizarEstadoSpy: vi.fn(async () => undefined),
  estadoState: {
    dados: {
      metas_kcal: 2000,
      metas_proteina_g: 150,
      metas_carbo_g: 250,
      metas_gordura_g: 60,
    } as Record<string, unknown>,
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn(async () => ({ content: [{ type: 'text', text: claudeState.text }] })),
    };
  },
}));

vi.mock('../src/services/evolution', () => ({
  sendText: sendTextSpy,
}));

vi.mock('../src/services/rag', () => ({
  query: vi.fn(async () => ''),
}));

vi.mock('../src/services/conversation', () => ({
  getEstado: vi.fn(async () => ({ dados: estadoState.dados })),
  atualizarEstado: atualizarEstadoSpy,
}));

// Importar DEPOIS dos mocks
import {
  analisarRefeicaoComClaude,
  processarTextoRefeicao,
  formatarCardMultiplo,
  AnaliseRefeicao,
  RefeicaoIndividual,
  MacrosRefeicao,
} from '../src/services/meal';
import type { PacienteInfo } from '../src/services/conversation';

const paciente = { id: 'pac-1', nome: 'Paciente Teste' } as PacienteInfo;

// Fixtures ---------------------------------------------------------------

function refeicaoJSON(
  tipo: string | null,
  itens: Array<Record<string, unknown>>,
  totais: MacrosRefeicao,
) {
  return {
    tipo_refeicao: tipo,
    itens,
    totais,
  };
}

function itemJSON(overrides: Partial<Record<string, unknown>>) {
  return {
    nome: 'Frango grelhado',
    quantidade_g: 200,
    quantidade_informada: true,
    material: true,
    preparo_inferido: false,
    ...overrides,
  };
}

beforeEach(() => {
  insertSpy.mockClear();
  rpcSpy.mockClear();
  sendTextSpy.mockClear();
  atualizarEstadoSpy.mockClear();
  claudeState.text = '{}';
});

// -----------------------------------------------------------------------

describe('analisarRefeicaoComClaude — shape nova refeicoes[]', () => {
  it('retorna refeicoes.length === 1 quando ha uma unica refeicao', async () => {
    claudeState.text = JSON.stringify({
      refeicoes: [
        refeicaoJSON(
          null,
          [itemJSON({ nome: 'Frango grelhado', quantidade_g: 200 })],
          { kcal: 400, proteina_g: 50, carbo_g: 0, gordura_g: 8 },
        ),
      ],
    });

    const analise = await analisarRefeicaoComClaude('comi 200g de frango');
    expect(analise.refeicoes).toHaveLength(1);
    expect(analise.refeicoes[0].tipo_refeicao).toBeUndefined();
    expect(analise.itens).toHaveLength(1);
    expect(analise.itens[0].nome).toBe('Frango grelhado');
    expect(analise.totais.kcal).toBe(400);
  });

  it('shape LEGACY {itens, totais} continua funcionando (compat)', async () => {
    // Este e exatamente o shape que os 296 testes antigos usam via analiseJSON()
    // em preparo.test.ts. Nao pode quebrar.
    claudeState.text = JSON.stringify({
      itens: [itemJSON({ nome: 'Arroz branco', quantidade_g: 100 })],
      totais: { kcal: 130, proteina_g: 3, carbo_g: 28, gordura_g: 0 },
    });

    const analise = await analisarRefeicaoComClaude('comi 100g de arroz');
    expect(analise.refeicoes).toHaveLength(1);
    expect(analise.refeicoes[0].tipo_refeicao).toBeUndefined();
    expect(analise.itens[0].nome).toBe('Arroz branco');
    expect(analise.totais.kcal).toBe(130);
  });

  it('shape nova com 3 refeicoes agrega totais corretamente', async () => {
    claudeState.text = JSON.stringify({
      refeicoes: [
        refeicaoJSON('café da manhã', [itemJSON({ nome: 'Ovo cozido', quantidade_g: 100 })],
          { kcal: 155, proteina_g: 13, carbo_g: 1, gordura_g: 11 }),
        refeicaoJSON('almoço', [itemJSON({ nome: 'Frango grelhado', quantidade_g: 200 })],
          { kcal: 400, proteina_g: 50, carbo_g: 0, gordura_g: 8 }),
        refeicaoJSON('jantar', [itemJSON({ nome: 'Salada verde', quantidade_g: 150 })],
          { kcal: 30, proteina_g: 2, carbo_g: 5, gordura_g: 0 }),
      ],
    });

    const analise = await analisarRefeicaoComClaude('café: 2 ovos. almoço: frango. janta: salada');
    expect(analise.refeicoes).toHaveLength(3);
    expect(analise.totais.kcal).toBe(155 + 400 + 30);
    expect(analise.totais.proteina_g).toBe(13 + 50 + 2);
    expect(analise.totais.carbo_g).toBe(1 + 0 + 5);
    expect(analise.totais.gordura_g).toBe(11 + 8 + 0);
    expect(analise.itens).toHaveLength(3);
  });
});

describe('processarTextoRefeicao — batch de multiplas refeicoes', () => {
  it('3 refeicoes → 3 inserts em `refeicoes` e 3 chamadas ao RPC de acumular', async () => {
    claudeState.text = JSON.stringify({
      refeicoes: [
        refeicaoJSON('café da manhã', [itemJSON({ nome: 'Ovo cozido', quantidade_g: 100 })],
          { kcal: 155, proteina_g: 13, carbo_g: 1, gordura_g: 11 }),
        refeicaoJSON('almoço', [itemJSON({ nome: 'Frango grelhado', quantidade_g: 200 })],
          { kcal: 400, proteina_g: 50, carbo_g: 0, gordura_g: 8 }),
        refeicaoJSON('jantar', [itemJSON({ nome: 'Salada verde', quantidade_g: 150 })],
          { kcal: 30, proteina_g: 2, carbo_g: 5, gordura_g: 0 }),
      ],
    });

    await processarTextoRefeicao('5562999999999', 'café: ovos. almoço: frango. janta: salada', paciente);

    expect(insertSpy).toHaveBeenCalledTimes(3);
    expect(rpcSpy).toHaveBeenCalledTimes(3);
    // Cada insert usa a descricao reconstruida com prefixo do tipo
    const descricoes = insertSpy.mock.calls.map((c) => (c[0] as { descricao: string }).descricao);
    expect(descricoes[0]).toContain('café da manhã:');
    expect(descricoes[1]).toContain('almoço:');
    expect(descricoes[2]).toContain('jantar:');
  });

  it('P0-2 e P0-2b DESLIGADOS em batch: mesmo com material sem qtd e preparo assumido, registra', async () => {
    claudeState.text = JSON.stringify({
      refeicoes: [
        refeicaoJSON('café da manhã',
          [itemJSON({ nome: 'Pão francês', quantidade_g: 50, quantidade_informada: false })],
          { kcal: 130, proteina_g: 5, carbo_g: 25, gordura_g: 1 }),
        refeicaoJSON('almoço',
          [itemJSON({ nome: 'Batata cozida', quantidade_g: 150, quantidade_informada: false, preparo_inferido: true })],
          { kcal: 120, proteina_g: 3, carbo_g: 27, gordura_g: 0 }),
      ],
    });

    await processarTextoRefeicao('5562999999999', 'café: pão. almoço: batata', paciente);

    // Registrou tudo (nao pediu quantidade nem preparo)
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(rpcSpy).toHaveBeenCalledTimes(2);
    // Nenhuma pendencia gravada
    const chamadas = atualizarEstadoSpy.mock.calls.map((c) => c[1]);
    for (const arg of chamadas) {
      const dados = (arg as { dados: Record<string, unknown> }).dados;
      expect(dados['refeicao_pendente']).toBeUndefined();
      expect(dados['preparo_pendente']).toBeUndefined();
    }
    // Card final saiu — sem perguntas
    const ultimaMsg = sendTextSpy.mock.calls.at(-1)?.[1] as string;
    expect(ultimaMsg).not.toContain('Quantas gramas');
    expect(ultimaMsg).not.toContain('Como foi o preparo');
  });

  it('card final contem "3 refeições registradas" e os tipos detectados', async () => {
    claudeState.text = JSON.stringify({
      refeicoes: [
        refeicaoJSON('café da manhã', [itemJSON({ nome: 'Ovo cozido', quantidade_g: 100 })],
          { kcal: 155, proteina_g: 13, carbo_g: 1, gordura_g: 11 }),
        refeicaoJSON('almoço', [itemJSON({ nome: 'Frango grelhado', quantidade_g: 200 })],
          { kcal: 400, proteina_g: 50, carbo_g: 0, gordura_g: 8 }),
        refeicaoJSON('jantar', [itemJSON({ nome: 'Salada verde', quantidade_g: 150 })],
          { kcal: 30, proteina_g: 2, carbo_g: 5, gordura_g: 0 }),
      ],
    });

    await processarTextoRefeicao('5562999999999', 'café: ovos. almoço: frango. janta: salada', paciente);

    const card = sendTextSpy.mock.calls.at(-1)?.[1] as string;
    expect(card).toContain('*3 refeições registradas!*');
    expect(card).toContain('café da manhã');
    expect(card).toContain('almoço');
    expect(card).toContain('jantar');
    // Nao usa formato do card single ("Registrado!" com !, mas nao "Registrado:" do saldo)
    expect(card).not.toContain('_Essa refeição:_');
  });

  it('single-meal (shape legacy) continua usando o card antigo — nao regressao', async () => {
    claudeState.text = JSON.stringify({
      itens: [itemJSON({ nome: 'Frango grelhado', quantidade_g: 200 })],
      totais: { kcal: 400, proteina_g: 50, carbo_g: 0, gordura_g: 8 },
    });

    await processarTextoRefeicao('5562999999999', 'comi 200g de frango', paciente);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const card = sendTextSpy.mock.calls.at(-1)?.[1] as string;
    // Card single tem "_Essa refeição:_" (card multiplo usa "_Total das refeições:_")
    expect(card).toContain('_Essa refeição:_');
    expect(card).not.toContain('refeições registradas!');
  });
});

describe('formatarCardMultiplo — teste puro', () => {
  it('monta blocos por tipo com emojis, total agregado e progresso do dia', () => {
    const metas = {
      kcal: 2000, proteina_g: 150, carbo_g: 250, gordura_g: 60,
      proteina_pct: 30, carbo_pct: 50, gordura_pct: 20,
    };
    const saldo = { kcal: 585, proteina_g: 65, carbo_g: 6, gordura_g: 19 };
    const refeicoes: RefeicaoIndividual[] = [
      {
        tipo_refeicao: 'café da manhã',
        itens: [
          { nome: 'Ovo cozido', quantidade_g: 100, quantidade_informada: true, material: true },
          { nome: 'Café preto', quantidade_g: 200, quantidade_informada: true, material: false },
        ],
        totais: { kcal: 155, proteina_g: 13, carbo_g: 1, gordura_g: 11 },
      },
      {
        tipo_refeicao: 'almoço',
        itens: [{ nome: 'Frango grelhado', quantidade_g: 200, quantidade_informada: true, material: true }],
        totais: { kcal: 400, proteina_g: 50, carbo_g: 0, gordura_g: 8 },
      },
      {
        tipo_refeicao: 'jantar',
        itens: [{ nome: 'Salada verde', quantidade_g: 150, quantidade_informada: false, material: true }],
        totais: { kcal: 30, proteina_g: 2, carbo_g: 5, gordura_g: 0 },
      },
    ];
    const analise: AnaliseRefeicao = {
      refeicoes,
      itens: refeicoes.flatMap((r) => r.itens),
      totais: { kcal: 585, proteina_g: 65, carbo_g: 6, gordura_g: 19 },
    };

    const card = formatarCardMultiplo(analise, saldo, metas);

    // Cabecalho
    expect(card).toContain('*3 refeições registradas!*');
    // Emojis por tipo
    expect(card).toContain('☕ *café da manhã*');
    expect(card).toContain('🍽️ *almoço*');
    expect(card).toContain('🍽️ *jantar*');
    // Itens materiais indentados; itens nao-materiais NAO aparecem no card multiplo
    expect(card).toContain('• Ovo cozido — 100g');
    expect(card).not.toContain('Café preto');
    // Total agregado
    expect(card).toContain('_Total das refeições:_ 585 kcal');
    // Rodape de estimativas — Salada verde teve quantidade nao informada
    expect(card).toContain('_Estimei');
    expect(card).toContain('Salada verde');
    // Progresso do dia embutido
    expect(card).toContain('*Seu dia até agora*');
  });

  it('sem estimativas → sem rodape "_Estimei ..._"', () => {
    const metas = {
      kcal: 2000, proteina_g: 150, carbo_g: 250, gordura_g: 60,
      proteina_pct: 30, carbo_pct: 50, gordura_pct: 20,
    };
    const saldo = { kcal: 600, proteina_g: 60, carbo_g: 30, gordura_g: 18 };
    const refeicoes: RefeicaoIndividual[] = [
      {
        tipo_refeicao: 'almoço',
        itens: [{ nome: 'Frango grelhado', quantidade_g: 200, quantidade_informada: true, material: true, preparo_inferido: false }],
        totais: { kcal: 400, proteina_g: 50, carbo_g: 0, gordura_g: 8 },
      },
      {
        tipo_refeicao: 'jantar',
        itens: [{ nome: 'Arroz branco', quantidade_g: 100, quantidade_informada: true, material: true }],
        totais: { kcal: 130, proteina_g: 3, carbo_g: 28, gordura_g: 0 },
      },
    ];
    const analise: AnaliseRefeicao = {
      refeicoes,
      itens: refeicoes.flatMap((r) => r.itens),
      totais: { kcal: 530, proteina_g: 53, carbo_g: 28, gordura_g: 8 },
    };
    expect(formatarCardMultiplo(analise, saldo, metas)).not.toContain('_Estimei');
  });

  it('preparo critico assumido → rodape mencion o preparo', () => {
    const metas = {
      kcal: 2000, proteina_g: 150, carbo_g: 250, gordura_g: 60,
      proteina_pct: 30, carbo_pct: 50, gordura_pct: 20,
    };
    const saldo = { kcal: 300, proteina_g: 50, carbo_g: 0, gordura_g: 8 };
    const refeicoes: RefeicaoIndividual[] = [
      {
        tipo_refeicao: 'almoço',
        itens: [{ nome: 'Frango grelhado', quantidade_g: 200, quantidade_informada: true, material: true, preparo_inferido: true }],
        totais: { kcal: 300, proteina_g: 50, carbo_g: 0, gordura_g: 8 },
      },
      {
        tipo_refeicao: 'jantar',
        itens: [{ nome: 'Salada verde', quantidade_g: 150, quantidade_informada: true, material: true }],
        totais: { kcal: 30, proteina_g: 2, carbo_g: 5, gordura_g: 0 },
      },
    ];
    const analise: AnaliseRefeicao = {
      refeicoes,
      itens: refeicoes.flatMap((r) => r.itens),
      totais: { kcal: 330, proteina_g: 52, carbo_g: 5, gordura_g: 8 },
    };
    const card = formatarCardMultiplo(analise, saldo, metas);
    expect(card).toContain('_Estimei o preparo de Frango grelhado');
    // Sem quantidade estimada → nao mistura "e as quantidades"
    expect(card).not.toContain('quantidade');
  });
});
