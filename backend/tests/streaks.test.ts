import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks ANTES dos imports do servico — meal.ts instancia Supabase/Anthropic no
// top-level. Vi.mock e hoisted (sobe antes dos imports), entao spies/state
// precisam ser declarados via vi.hoisted pra evitar TDZ.
const { dbState, selectSpy, supabaseMock } = vi.hoisted(() => {
  const state: { rows: Array<Record<string, unknown>>; error: { message: string } | null } = {
    rows: [],
    error: null,
  };
  const sel = vi.fn();
  return {
    dbState: state,
    selectSpy: sel,
    supabaseMock: {
      from: vi.fn((_table: string) => ({
        select: vi.fn((cols: string) => {
          sel(_table, cols);
          return {
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn(async () => ({ data: state.rows, error: state.error })),
              })),
            })),
          };
        }),
      })),
      rpc: vi.fn(async () => ({ error: null })),
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

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
import { calcularStreak, linhaStreak, microMensagemFinal, StreakInfo } from '../src/services/meal';
import type { MacrosDiarios } from '../src/services/calculos';

// Metas de referencia: zona de kcal = [1900, 2200]; proteina bate com >= 142.5g.
const metas: MacrosDiarios = {
  kcal: 2000,
  proteina_g: 150,
  carbo_g: 250,
  gordura_g: 60,
};

// Datas em UTC yyyy-mm-dd, mesmo formato que acumular_registro_diario grava.
function diasAtras(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Linha de registros_diarios que bate ambas as dimensoes.
function diaBom(n: number): Record<string, unknown> {
  return { data: diasAtras(n), kcal_consumido: 2000, proteina_g: 150 };
}

beforeEach(() => {
  dbState.rows = [];
  dbState.error = null;
  selectSpy.mockClear();
});

describe('calcularStreak', () => {
  it('sem registros → 0/0', async () => {
    const s = await calcularStreak('paciente-1', metas);
    expect(s).toEqual({ proteina: 0, kcal: 0, batendo_hoje_proteina: false, batendo_hoje_kcal: false });
  });

  it('3 dias seguidos bateram, hoje sem registro → 3/3 com batendo_hoje=false (nao quebra)', async () => {
    dbState.rows = [diaBom(1), diaBom(2), diaBom(3)];
    const s = await calcularStreak('paciente-1', metas);
    expect(s.proteina).toBe(3);
    expect(s.kcal).toBe(3);
    expect(s.batendo_hoje_proteina).toBe(false);
    expect(s.batendo_hoje_kcal).toBe(false);
  });

  it('hoje bateu + 2 dias anteriores bateram → 3/3 com batendo_hoje=true', async () => {
    dbState.rows = [diaBom(0), diaBom(1), diaBom(2)];
    const s = await calcularStreak('paciente-1', metas);
    expect(s.proteina).toBe(3);
    expect(s.kcal).toBe(3);
    expect(s.batendo_hoje_proteina).toBe(true);
    expect(s.batendo_hoje_kcal).toBe(true);
  });

  it('hoje em andamento (kcal=0) + 2 anteriores bateram → 2/2, batendo_hoje=false', async () => {
    dbState.rows = [
      { data: diasAtras(0), kcal_consumido: 0, proteina_g: 0 },
      diaBom(1),
      diaBom(2),
    ];
    const s = await calcularStreak('paciente-1', metas);
    expect(s.proteina).toBe(2);
    expect(s.kcal).toBe(2);
    expect(s.batendo_hoje_proteina).toBe(false);
    expect(s.batendo_hoje_kcal).toBe(false);
  });

  it('hoje ultrapassou (kcal > 110% da meta) → quebra kcal, mas proteina batida segue contando', async () => {
    dbState.rows = [
      { data: diasAtras(0), kcal_consumido: 2500, proteina_g: 160 }, // 2500 > 2200
      diaBom(1),
      diaBom(2),
    ];
    const s = await calcularStreak('paciente-1', metas);
    expect(s.kcal).toBe(0);
    expect(s.batendo_hoje_kcal).toBe(false);
    expect(s.proteina).toBe(3);
    expect(s.batendo_hoje_proteina).toBe(true);
  });

  it('tolerancia: 95% da meta conta como batida; abaixo disso nao', async () => {
    dbState.rows = [
      // 1900 = exatamente 0.95*2000; 142.5 = 0.95*150
      { data: diasAtras(1), kcal_consumido: 1900, proteina_g: 142.5 },
      // 1899 kcal e 142 g ficam abaixo da tolerancia → quebram as duas
      { data: diasAtras(2), kcal_consumido: 1899, proteina_g: 142 },
    ];
    const s = await calcularStreak('paciente-1', metas);
    expect(s.kcal).toBe(1);
    expect(s.proteina).toBe(1);
  });

  it('gap de 2 dias sem registro → 0/0 (streak quebrado)', async () => {
    dbState.rows = [diaBom(2), diaBom(3)]; // nada hoje nem ontem
    const s = await calcularStreak('paciente-1', metas);
    expect(s.proteina).toBe(0);
    expect(s.kcal).toBe(0);
  });

  it('gap de 1 dia no meio da sequencia quebra o streak nas duas dimensoes', async () => {
    dbState.rows = [diaBom(0), diaBom(1), diaBom(3)]; // buraco em diasAtras(2)
    const s = await calcularStreak('paciente-1', metas);
    expect(s.proteina).toBe(2);
    expect(s.kcal).toBe(2);
  });

  it('meta zerada → 0/0 sem consultar o banco (guard)', async () => {
    const metasVazias: MacrosDiarios = { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 };
    dbState.rows = [diaBom(0), diaBom(1)];
    const s = await calcularStreak('paciente-1', metasVazias);
    expect(s).toEqual({ proteina: 0, kcal: 0, batendo_hoje_proteina: false, batendo_hoje_kcal: false });
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('erro na query → 0/0 (nao derruba o card)', async () => {
    dbState.error = { message: 'boom' };
    dbState.rows = [];
    const s = await calcularStreak('paciente-1', metas);
    expect(s).toEqual({ proteina: 0, kcal: 0, batendo_hoje_proteina: false, batendo_hoje_kcal: false });
  });
});

describe('linhaStreak — mensagem 🔥 do card', () => {
  const base: StreakInfo = { proteina: 0, kcal: 0, batendo_hoje_proteina: false, batendo_hoje_kcal: false };

  it('sem streak (undefined) → vazio', () => {
    expect(linhaStreak(undefined)).toBe('');
  });

  it('streak 1 nao e sequencia → vazio', () => {
    expect(linhaStreak({ ...base, proteina: 1, kcal: 1 })).toBe('');
  });

  it('streak >= 2 de proteina gera a linha 🔥', () => {
    const msg = linhaStreak({ ...base, proteina: 3, batendo_hoje_proteina: true });
    expect(msg).toBe('🔥 *3 dias seguidos batendo a proteína!*');
  });

  it('kcal maior que proteina → mensagem fala de calorias', () => {
    const msg = linhaStreak({ ...base, proteina: 2, kcal: 4, batendo_hoje_kcal: true });
    expect(msg).toContain('4 dias seguidos');
    expect(msg).toContain('calorias');
  });

  it('empate entre dimensoes → proteina vence', () => {
    const msg = linhaStreak({ ...base, proteina: 3, kcal: 3, batendo_hoje_proteina: true, batendo_hoje_kcal: true });
    expect(msg).toContain('proteína');
    expect(msg).not.toContain('calorias');
  });

  it('quando hoje ainda nao bateu, convida pro proximo dia', () => {
    const msg = linhaStreak({ ...base, proteina: 2, batendo_hoje_proteina: false });
    expect(msg).toContain('Vamos pro próximo?');
  });
});

describe('microMensagemFinal com streak', () => {
  it('prepende a linha 🔥 acima da micro-mensagem normal', () => {
    const saldo = { kcal: 1000, proteina_g: 120, carbo_g: 150, gordura_g: 30 };
    const streak: StreakInfo = { proteina: 3, kcal: 2, batendo_hoje_proteina: true, batendo_hoje_kcal: false };
    const msg = microMensagemFinal(saldo, metas, streak);
    const linhas = msg.split('\n');
    expect(linhas[0]).toBe('🔥 *3 dias seguidos batendo a proteína!*');
    expect(linhas[1]).toContain('1000 kcal');
  });

  it('streak < 2 mantem a mensagem original intacta', () => {
    const saldo = { kcal: 1000, proteina_g: 120, carbo_g: 150, gordura_g: 30 };
    const streak: StreakInfo = { proteina: 1, kcal: 0, batendo_hoje_proteina: true, batendo_hoje_kcal: false };
    expect(microMensagemFinal(saldo, metas, streak)).toBe(microMensagemFinal(saldo, metas));
  });
});
