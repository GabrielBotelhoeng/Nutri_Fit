import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks ANTES dos imports do servico — meal.ts instancia Supabase/Anthropic no
// top-level. Vi.mock e hoisted (sobe antes dos imports), entao spies/state
// precisam ser declarados via vi.hoisted pra evitar TDZ.
const { insertSpy, rpcSpy, claudeState, supabaseMock } = vi.hoisted(() => {
  const ins = vi.fn();
  const rpc = vi.fn();
  const claude: { text: string } = { text: '{}' };
  return {
    insertSpy: ins,
    rpcSpy: rpc,
    claudeState: claude,
    supabaseMock: {
      from: vi.fn((_table: string) => ({
        insert: vi.fn((row: unknown) => {
          ins(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: 'ref-novo-1', registrado_em: new Date().toISOString() },
                error: null,
              })),
            })),
          };
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            // obterSaldoDia: .eq('data').maybeSingle()
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
            // calcularStreak: .gte('data').order(...)
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
  ehPreparoCritico,
  detectarItemPreparoInferido,
  obterPreparoPendenteSeValido,
  processarTextoRefeicao,
  processarRespostaPreparo,
  formatarCardRefeicao,
  TTL_REFEICAO_PENDENTE_MIN,
  ItemRefeicao,
  AnaliseRefeicao,
} from '../src/services/meal';
import type { PacienteInfo } from '../src/services/conversation';

const paciente = { id: 'pac-1', nome: 'Paciente Teste' } as PacienteInfo;

function item(overrides: Partial<ItemRefeicao>): ItemRefeicao {
  return {
    nome: 'item',
    quantidade_g: 100,
    quantidade_informada: true,
    material: true,
    preparo_inferido: false,
    ...overrides,
  };
}

// JSON que o mock do Haiku devolve pra analisarRefeicaoComClaude.
function analiseJSON(itens: Array<Record<string, unknown>>, kcal = 300): string {
  return JSON.stringify({
    itens,
    totais: { kcal, proteina_g: 20, carbo_g: 30, gordura_g: 10 },
  });
}

beforeEach(() => {
  insertSpy.mockClear();
  rpcSpy.mockClear();
  sendTextSpy.mockClear();
  atualizarEstadoSpy.mockClear();
  claudeState.text = '{}';
});

describe('ehPreparoCritico — whitelist de alimentos sensiveis a preparo', () => {
  it('reconhece os alimentos da whitelist (com e sem preparo no nome)', () => {
    expect(ehPreparoCritico('Batata cozida')).toBe(true);
    expect(ehPreparoCritico('batatas')).toBe(true);
    expect(ehPreparoCritico('Frango grelhado')).toBe(true);
    expect(ehPreparoCritico('Ovo frito')).toBe(true);
    expect(ehPreparoCritico('ovos mexidos')).toBe(true);
    expect(ehPreparoCritico('Peixe assado')).toBe(true);
    expect(ehPreparoCritico('Carne moída refogada')).toBe(true); // acento normalizado
  });

  it('nao dispara pra alimentos fora da whitelist', () => {
    expect(ehPreparoCritico('Arroz branco')).toBe(false);
    expect(ehPreparoCritico('Feijão')).toBe(false);
    expect(ehPreparoCritico('Banana')).toBe(false);
    expect(ehPreparoCritico('Carne assada')).toBe(false); // so carne MOIDA esta na whitelist
  });
});

describe('detectarItemPreparoInferido', () => {
  it('acha item critico com preparo assumido', () => {
    const itens = [
      item({ nome: 'Arroz branco', preparo_inferido: false }),
      item({ nome: 'Batata cozida', preparo_inferido: true }),
    ];
    expect(detectarItemPreparoInferido(itens)?.nome).toBe('Batata cozida');
  });

  it('null quando o paciente informou o preparo', () => {
    const itens = [item({ nome: 'Batata frita', preparo_inferido: false })];
    expect(detectarItemPreparoInferido(itens)).toBeNull();
  });

  it('null quando o preparo inferido e de alimento fora da whitelist', () => {
    const itens = [item({ nome: 'Arroz integral', preparo_inferido: true })];
    expect(detectarItemPreparoInferido(itens)).toBeNull();
  });

  it('null pra item nao-material mesmo que bata na whitelist', () => {
    const itens = [item({ nome: 'Caldo de frango', material: false, preparo_inferido: true })];
    expect(detectarItemPreparoInferido(itens)).toBeNull();
  });

  it('null pra analises antigas sem o campo preparo_inferido', () => {
    const antigo = { nome: 'Batata cozida', quantidade_g: 150, quantidade_informada: true, material: true } as ItemRefeicao;
    expect(detectarItemPreparoInferido([antigo])).toBeNull();
  });
});

describe('obterPreparoPendenteSeValido — gating por TTL', () => {
  const analise: AnaliseRefeicao = {
    itens: [item({ nome: 'Batata cozida', preparo_inferido: true, quantidade_informada: false })],
    totais: { kcal: 120, proteina_g: 3, carbo_g: 27, gordura_g: 0 },
  };
  const basePendente = {
    descricao_original: 'comi batata',
    analise,
    item_perguntado: 'Batata cozida',
    timestamp: new Date().toISOString(),
  };

  it('retorna a pendencia quando recente', () => {
    const p = obterPreparoPendenteSeValido({ preparo_pendente: basePendente });
    expect(p?.item_perguntado).toBe('Batata cozida');
  });

  it('null quando passou do TTL', () => {
    const expirado = {
      ...basePendente,
      timestamp: new Date(Date.now() - (TTL_REFEICAO_PENDENTE_MIN + 1) * 60 * 1000).toISOString(),
    };
    expect(obterPreparoPendenteSeValido({ preparo_pendente: expirado })).toBeNull();
  });

  it('null quando nao ha pendencia ou esta incompleta', () => {
    expect(obterPreparoPendenteSeValido({})).toBeNull();
    expect(obterPreparoPendenteSeValido({ preparo_pendente: { ...basePendente, analise: undefined } })).toBeNull();
  });
});

describe('formatarCardRefeicao — marcador _(estimei)_ por preparo assumido', () => {
  const metas = { kcal: 2000, proteina_g: 150, carbo_g: 250, gordura_g: 60, proteina_pct: 30, carbo_pct: 50, gordura_pct: 20 };
  const saldo = { kcal: 300, proteina_g: 20, carbo_g: 30, gordura_g: 10 };

  it('quantidade informada mas preparo assumido em item critico → _(estimei)_ sem "~"', () => {
    const analise: AnaliseRefeicao = {
      itens: [item({ nome: 'Batata cozida', quantidade_g: 150, quantidade_informada: true, preparo_inferido: true })],
      totais: saldo,
    };
    const card = formatarCardRefeicao(analise, saldo, metas);
    expect(card).toContain('Batata cozida — 150g _(estimei)_');
    expect(card).not.toContain('~150g');
  });

  it('quantidade e preparo informados → sem marcador', () => {
    const analise: AnaliseRefeicao = {
      itens: [item({ nome: 'Batata frita', quantidade_g: 150 })],
      totais: saldo,
    };
    expect(formatarCardRefeicao(analise, saldo, metas)).not.toContain('_(estimei)_');
  });

  it('preparo assumido em item fora da whitelist nao marca sozinho', () => {
    const analise: AnaliseRefeicao = {
      itens: [item({ nome: 'Arroz branco', quantidade_g: 100, preparo_inferido: true })],
      totais: saldo,
    };
    expect(formatarCardRefeicao(analise, saldo, metas)).not.toContain('_(estimei)_');
  });
});

describe('processarTextoRefeicao — pergunta de preparo antes do registro (P0-2b)', () => {
  it('"comi batata" (preparo assumido) → pergunta o preparo e NAO registra', async () => {
    claudeState.text = analiseJSON([
      { nome: 'Batata cozida', quantidade_g: 150, quantidade_informada: false, material: true, preparo_inferido: true },
    ]);

    await processarTextoRefeicao('5562999999999', 'comi batata', paciente);

    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toContain('Como foi o preparo de *Batata*?'); // "cozida" removido do nome
    expect(atualizarEstadoSpy).toHaveBeenCalledWith(
      'pac-1',
      expect.objectContaining({
        dados: expect.objectContaining({
          preparo_pendente: expect.objectContaining({ item_perguntado: 'Batata cozida' }),
        }),
      }),
    );
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('"comi batata frita" (preparo informado) → nao pergunta preparo; segue pro fluxo de quantidade', async () => {
    claudeState.text = analiseJSON([
      { nome: 'Batata frita', quantidade_g: 150, quantidade_informada: false, material: true, preparo_inferido: false },
    ]);

    await processarTextoRefeicao('5562999999999', 'comi batata frita', paciente);

    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toContain('Quantas gramas');
    expect(msg).not.toContain('preparo');
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});

describe('processarRespostaPreparo', () => {
  const pendenteBase = {
    descricao_original: 'comi batata',
    analise: {
      itens: [item({ nome: 'Batata cozida', quantidade_g: 150, quantidade_informada: true, preparo_inferido: true })],
      totais: { kcal: 120, proteina_g: 3, carbo_g: 27, gordura_g: 0 },
    } as AnaliseRefeicao,
    item_perguntado: 'Batata cozida',
  };

  it('"não sei" → registra com o preparo assumido e card mantem _(estimei)_', async () => {
    await processarRespostaPreparo('5562999999999', 'não sei', paciente, pendenteBase);

    // Limpou a pendencia antes de gravar
    expect(atualizarEstadoSpy).toHaveBeenCalledWith(
      'pac-1',
      expect.objectContaining({ dados: expect.objectContaining({ preparo_pendente: null }) }),
    );
    // Registrou com a descricao original (sem re-analise)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ descricao: 'comi batata', kcal: 120 }));
    expect(rpcSpy).toHaveBeenCalledWith('acumular_registro_diario', expect.anything());
    // Card final mantem o marcador de estimativa do preparo
    const card = sendTextSpy.mock.calls.at(-1)?.[1] as string;
    expect(card).toContain('_(estimei)_');
  });

  it('"frita" → recalcula com o preparo informado e registra os novos macros', async () => {
    claudeState.text = analiseJSON(
      [{ nome: 'Batata frita', quantidade_g: 150, quantidade_informada: true, material: true, preparo_inferido: false }],
      465,
    );

    await processarRespostaPreparo('5562999999999', 'frita', paciente, pendenteBase);

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: 'comi batata (Batata cozida: preparo frita)',
        kcal: 465,
      }),
    );
    const card = sendTextSpy.mock.calls.at(-1)?.[1] as string;
    expect(card).toContain('Batata frita');
    expect(card).not.toContain('_(estimei)_');
  });

  it('"frita" com quantidade ainda desconhecida → encadeia a pergunta de quantidade (P0-2) sem registrar', async () => {
    claudeState.text = analiseJSON(
      [{ nome: 'Batata frita', quantidade_g: 150, quantidade_informada: false, material: true, preparo_inferido: false }],
      465,
    );

    await processarRespostaPreparo('5562999999999', 'frita', paciente, pendenteBase);

    const msg = sendTextSpy.mock.calls.at(-1)?.[1] as string;
    expect(msg).toContain('Quantas gramas de *Batata frita*');
    expect(atualizarEstadoSpy).toHaveBeenCalledWith(
      'pac-1',
      expect.objectContaining({
        dados: expect.objectContaining({
          refeicao_pendente: expect.objectContaining({ item_perguntado: 'Batata frita' }),
        }),
      }),
    );
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('re-analise invalida (kcal 0) → cai de volta na analise original e registra', async () => {
    claudeState.text = '{}'; // Haiku falhou
    await processarRespostaPreparo('5562999999999', 'frita', paciente, pendenteBase);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ descricao: 'comi batata', kcal: 120 }));
  });
});
