import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Revisão 2026-10-23 — dois bugs em corrigirUltimaRefeicao:
// 1. O delta ia sempre pro registro diário de HOJE. Refeição às 23h30 corrigida às
//    00h10 (dentro do TTL de 60 min) somava a diferença no dia seguinte: ontem ficava
//    com o valor antigo e hoje com um delta solto.
// 2. UPDATE em `refeicoes` e RPC do saldo não eram atômicos: se o RPC falhasse, a
//    refeição ficava corrigida e o total do dia não (registrarRefeicao já tinha rollback).

const { updates, rpcCalls, rpcResultado } = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcResultado: { error: null as unknown },
}));

vi.mock('@supabase/supabase-js', () => {
  const supabase = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        const fim = { eq: () => fim, then: (r: (v: unknown) => void) => r({ error: null }) };
        return fim;
      },
      select: () => {
        const c = { eq: () => c, single: async () => ({ data: { entrevista_dados: {} }, error: null }), maybeSingle: async () => ({ data: { entrevista_dados: {} }, error: null }) };
        return c;
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return rpcResultado;
    },
  };
  return { createClient: () => supabase };
});
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() }; } }));
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));
vi.mock('../src/services/rag', () => ({ ragQuery: vi.fn(async () => '') }));

import { corrigirUltimaRefeicao, type UltimaRefeicao } from '../src/services/meal';

const ultimaAs = (registradoEm: string): UltimaRefeicao => ({
  id: 'ref-1',
  descricao: 'arroz e feijão',
  macros: { kcal: 450, proteina_g: 15, carbo_g: 80, gordura_g: 8 },
  registrado_em: registradoEm,
});
const novos = { kcal: 300, proteina_g: 10, carbo_g: 55, gordura_g: 5 };

beforeEach(() => {
  updates.length = 0;
  rpcCalls.length = 0;
  rpcResultado.error = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('corrigirUltimaRefeicao — dia certo', () => {
  it('correção logo após a meia-noite aplica o delta no dia em que a refeição foi registrada', async () => {
    // 00h10 de 23/10 em Brasília (UTC-3) = 03h10Z
    vi.useFakeTimers({ now: new Date('2026-10-23T03:10:00Z'), toFake: ['Date'] });
    // 23h30 de 22/10 em Brasília = 02h30Z do dia 23
    await corrigirUltimaRefeicao('pac-1', ultimaAs('2026-10-23T02:30:00Z'), 'arroz', novos);
    const rpc = rpcCalls.find((c) => c.name === 'corrigir_registro_diario');
    expect(rpc?.args.p_data).toBe('2026-10-22');
  });

  it('correção no mesmo dia continua usando o dia de hoje', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-23T15:00:00Z'), toFake: ['Date'] });
    await corrigirUltimaRefeicao('pac-1', ultimaAs('2026-10-23T14:30:00Z'), 'arroz', novos);
    expect(rpcCalls.find((c) => c.name === 'corrigir_registro_diario')?.args.p_data).toBe('2026-10-23');
  });
});

describe('corrigirUltimaRefeicao — consistência quando o saldo falha', () => {
  it('se o RPC falhar, desfaz o UPDATE (volta descrição e macros antigos) e lança erro', async () => {
    rpcResultado.error = { message: 'RPC indisponível' };
    await expect(
      corrigirUltimaRefeicao('pac-1', ultimaAs(new Date().toISOString()), 'arroz', novos),
    ).rejects.toThrow(/RPC indisponível/);

    // 1º update aplica a correção; o 2º precisa restaurar a versão anterior.
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({
      descricao: 'arroz e feijão',
      kcal: 450,
      proteina_g: 15,
      carbo_g: 80,
      gordura_g: 8,
    });
  });
});
