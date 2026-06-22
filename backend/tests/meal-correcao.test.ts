import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks ANTES dos imports do servico — meal.ts instancia Supabase/Anthropic no
// top-level. Vi.mock e hoisted (sobe antes dos imports), entao spies/state
// precisam ser declarados via vi.hoisted pra evitar TDZ.
const { updateSpy, insertSpy, rpcSpy, supabaseMock } = vi.hoisted(() => {
  const upd = vi.fn();
  const ins = vi.fn();
  const rpc = vi.fn();
  return {
    updateSpy: upd,
    insertSpy: ins,
    rpcSpy: rpc,
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
        update: vi.fn((patch: unknown) => {
          upd(patch);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { entrevista_dados: {} }, error: null })),
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

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

// Anthropic — meal.ts importa pra `calcularMacrosComClaude`. Nao chamamos
// nessas suites, mas o import precisa resolver sem fazer rede.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn(async () => ({ content: [{ type: 'text', text: '{}' }] })) };
  },
}));

vi.mock('../src/services/evolution', () => ({
  sendText: vi.fn(async () => undefined),
}));

vi.mock('../src/services/rag', () => ({
  query: vi.fn(async () => ''),
}));

// Importar DEPOIS dos mocks
import {
  obterUltimaRefeicaoSeRecente,
  corrigirUltimaRefeicao,
  registrarRefeicao,
  TTL_ULTIMA_REFEICAO_MIN,
} from '../src/services/meal';
import type { UltimaRefeicao } from '../src/services/conversation';

beforeEach(() => {
  updateSpy.mockClear();
  insertSpy.mockClear();
  rpcSpy.mockClear();
});

describe('obterUltimaRefeicaoSeRecente — gating por TTL', () => {
  const baseUltima: UltimaRefeicao = {
    id: 'ref-1',
    descricao: '200g de frango com arroz',
    macros: { kcal: 450, proteina_g: 50, carbo_g: 40, gordura_g: 8 },
    registrado_em: new Date().toISOString(),
  };

  it('retorna a refeicao quando registrada agora', () => {
    const r = obterUltimaRefeicaoSeRecente({ ultima_refeicao: baseUltima });
    expect(r).toEqual(baseUltima);
  });

  it('retorna null quando passou do TTL', () => {
    const expirada: UltimaRefeicao = {
      ...baseUltima,
      registrado_em: new Date(Date.now() - (TTL_ULTIMA_REFEICAO_MIN + 1) * 60 * 1000).toISOString(),
    };
    expect(obterUltimaRefeicaoSeRecente({ ultima_refeicao: expirada })).toBeNull();
  });

  it('retorna null quando ainda nao existe ultima_refeicao no estado', () => {
    expect(obterUltimaRefeicaoSeRecente({})).toBeNull();
  });

  it('retorna null quando o snapshot esta incompleto (sem id)', () => {
    const semId = { ...baseUltima, id: '' };
    expect(obterUltimaRefeicaoSeRecente({ ultima_refeicao: semId })).toBeNull();
  });

  it('retorna null quando registrado_em esta ausente', () => {
    const sem = { ...baseUltima } as Partial<UltimaRefeicao>;
    delete sem.registrado_em;
    expect(obterUltimaRefeicaoSeRecente({ ultima_refeicao: sem as UltimaRefeicao })).toBeNull();
  });
});

describe('corrigirUltimaRefeicao — UPDATE + delta (cenario do P0-1)', () => {
  it('faz UPDATE na linha existente e chama corrigir_registro_diario com o delta certo (450 -> 505)', async () => {
    const ultima: UltimaRefeicao = {
      id: 'ref-1',
      descricao: '200g de frango com arroz',
      macros: { kcal: 450, proteina_g: 50, carbo_g: 40, gordura_g: 8 },
      registrado_em: new Date().toISOString(),
    };

    const novosMacros = { kcal: 505, proteina_g: 50, carbo_g: 60, gordura_g: 10 };

    await corrigirUltimaRefeicao(
      'paciente-1',
      ultima,
      '200g frango + 100g arroz + 100g feijao + coca zero',
      novosMacros,
    );

    // Nao deve ter inserido refeicao nova
    expect(insertSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ kcal: novosMacros.kcal, paciente_id: 'paciente-1' }),
    );

    // UPDATE da linha existente com novos macros
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kcal: novosMacros.kcal,
        proteina_g: novosMacros.proteina_g,
        carbo_g: novosMacros.carbo_g,
        gordura_g: novosMacros.gordura_g,
      }),
    );

    // RPC de correcao com delta = novos - antigos (NAO acumular_registro_diario)
    expect(rpcSpy).toHaveBeenCalledWith(
      'corrigir_registro_diario',
      expect.objectContaining({
        p_paciente_id: 'paciente-1',
        p_delta_kcal: novosMacros.kcal - ultima.macros.kcal,            // +55
        p_delta_proteina_g: novosMacros.proteina_g - ultima.macros.proteina_g, // 0
        p_delta_carbo_g: novosMacros.carbo_g - ultima.macros.carbo_g,         // +20
        p_delta_gordura_g: novosMacros.gordura_g - ultima.macros.gordura_g,   // +2
      }),
    );

    // E o acumulador NAO foi chamado (esse e o bug do P0-1)
    expect(rpcSpy).not.toHaveBeenCalledWith('acumular_registro_diario', expect.anything());
  });

  it('aceita delta negativo quando a correcao reduz macros (350 < 450)', async () => {
    const ultima: UltimaRefeicao = {
      id: 'ref-2',
      descricao: '300g frango',
      macros: { kcal: 450, proteina_g: 90, carbo_g: 0, gordura_g: 5 },
      registrado_em: new Date().toISOString(),
    };

    await corrigirUltimaRefeicao(
      'paciente-1',
      ultima,
      'foram 200g de frango (na verdade)',
      { kcal: 300, proteina_g: 60, carbo_g: 0, gordura_g: 3 },
    );

    expect(rpcSpy).toHaveBeenCalledWith(
      'corrigir_registro_diario',
      expect.objectContaining({
        p_delta_kcal: -150,
        p_delta_proteina_g: -30,
        p_delta_gordura_g: -2,
      }),
    );
  });
});

describe('registrarRefeicao — persiste snapshot da ultima refeicao', () => {
  it('retorna UltimaRefeicao com id da row inserida e os macros sanitizados', async () => {
    const out = await registrarRefeicao(
      'paciente-1',
      '200g de frango com arroz',
      { kcal: 450, proteina_g: 50, carbo_g: 40, gordura_g: 8 },
      'texto',
    );
    expect(out.id).toBe('ref-novo-1');
    expect(out.macros).toEqual({ kcal: 450, proteina_g: 50, carbo_g: 40, gordura_g: 8 });
    expect(rpcSpy).toHaveBeenCalledWith('acumular_registro_diario', expect.anything());
  });
});
