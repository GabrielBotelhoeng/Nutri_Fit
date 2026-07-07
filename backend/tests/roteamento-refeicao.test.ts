import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mesmo scaffold de mocks do preparo.test.ts — meal.ts instancia
// Supabase/Anthropic no top-level.
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

const { sendTextSpy, ragQuerySpy } = vi.hoisted(() => ({
  sendTextSpy: vi.fn(async () => undefined),
  ragQuerySpy: vi.fn(async () => ''),
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
  query: ragQuerySpy,
}));

vi.mock('../src/services/conversation', () => ({
  getEstado: vi.fn(async () => ({
    dados: { metas_kcal: 2000, metas_proteina_g: 150, metas_carbo_g: 250, metas_gordura_g: 60 },
  })),
  atualizarEstado: vi.fn(async () => undefined),
}));

import { processarTextoRefeicao } from '../src/services/meal';
import type { PacienteInfo } from '../src/services/conversation';

const paciente = { id: 'pac-1', nome: 'Paciente Teste' } as PacienteInfo;

function analiseJSON(nome: string, kcal: number): string {
  return JSON.stringify({
    itens: [{ nome, quantidade_g: 200, quantidade_informada: true, material: true, preparo_inferido: false }],
    totais: { kcal, proteina_g: 15, carbo_g: 20, gordura_g: 10 },
  });
}

beforeEach(() => {
  insertSpy.mockClear();
  rpcSpy.mockClear();
  sendTextSpy.mockClear();
  ragQuerySpy.mockClear();
  claudeState.text = '{}';
});

describe('processarTextoRefeicao — intentHint do classificador (P1-3)', () => {
  it('hint "registrar" registra mesmo quando o regex interno nao reconhece ("2 copos de leite")', async () => {
    claudeState.text = analiseJSON('Leite integral', 240);

    await processarTextoRefeicao('5562999999999', '2 copos de leite', paciente, 'registrar');

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ descricao: '2 copos de leite', kcal: 240 }));
    expect(rpcSpy).toHaveBeenCalledWith('acumular_registro_diario', expect.anything());
    expect(sendTextSpy).toHaveBeenCalled(); // card enviado — nada de sumico silencioso
  });

  it('sem hint, o mesmo texto continua sendo ignorado em silencio (fallback do fluxo de correcao)', async () => {
    claudeState.text = analiseJSON('Leite integral', 240);

    await processarTextoRefeicao('5562999999999', '2 copos de leite', paciente);

    expect(insertSpy).not.toHaveBeenCalled();
    expect(sendTextSpy).not.toHaveBeenCalled();
  });

  it('hint "registrar" NAO desvia pra substituicao quando o texto contem "nao tenho"', async () => {
    claudeState.text = analiseJSON('Arroz branco', 260);

    await processarTextoRefeicao(
      '5562999999999',
      'comi 200g de arroz mas não tenho certeza da quantidade',
      paciente,
      'registrar',
    );

    expect(ragQuerySpy).not.toHaveBeenCalled(); // sugerirSubstituicao nao rodou
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ kcal: 260 }));
  });

  it('hint "substituicao" responde substituicao mesmo sem bater no regex interno ("acabou o frango")', async () => {
    await processarTextoRefeicao('5562999999999', 'acabou o frango, o que eu como?', paciente, 'substituicao');

    expect(ragQuerySpy).toHaveBeenCalled();
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toContain('Não encontrei substitutos'); // RAG mockado vazio
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('sem hint, regex de substituicao continua funcionando ("não tenho frango")', async () => {
    await processarTextoRefeicao('5562999999999', 'não tenho frango', paciente);
    expect(ragQuerySpy).toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
