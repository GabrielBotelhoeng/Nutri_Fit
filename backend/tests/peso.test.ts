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
