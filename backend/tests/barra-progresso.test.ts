import { describe, it, expect, vi } from 'vitest';

// barraProgresso e microMensagemFinal sao funcoes puras, mas vivem em meal.ts
// que importa Supabase/Anthropic/Evolution/RAG no top-level. Precisamos
// silenciar esses imports — em especial rag.ts importa pdf-parse, que executa
// fs.readFile no top-level e quebra fora do projeto.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(), rpc: vi.fn() })),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));
vi.mock('../src/services/rag', () => ({ query: vi.fn() }));

import { barraProgresso, microMensagemFinal } from '../src/services/meal';
import type { MacrosDiarios } from '../src/services/calculos';

describe('barraProgresso', () => {
  it('vazia quando atual e 0', () => {
    expect(barraProgresso(0, 100)).toBe('▱'.repeat(10));
  });

  it('cheia quando atual = meta', () => {
    expect(barraProgresso(100, 100)).toBe('▰'.repeat(10));
  });

  it('metade preenchida em 50%', () => {
    expect(barraProgresso(50, 100)).toBe('▰▰▰▰▰▱▱▱▱▱');
  });

  it('satura em 100% quando ultrapassa a meta', () => {
    expect(barraProgresso(150, 100)).toBe('▰'.repeat(10));
    expect(barraProgresso(9999, 100)).toBe('▰'.repeat(10));
  });

  it('vazia quando meta = 0 (divisao por zero)', () => {
    expect(barraProgresso(50, 0)).toBe('▱'.repeat(10));
  });

  it('vazia quando meta negativa', () => {
    expect(barraProgresso(50, -100)).toBe('▱'.repeat(10));
  });

  it('vazia quando atual negativo', () => {
    expect(barraProgresso(-10, 100)).toBe('▱'.repeat(10));
  });

  it('respeita parametro blocos', () => {
    // 50/100 * 5 = 2.5 → Math.round → 3
    expect(barraProgresso(50, 100, 5)).toBe('▰▰▰▱▱');
    expect(barraProgresso(100, 100, 5)).toBe('▰▰▰▰▰');
    expect(barraProgresso(0, 100, 5)).toBe('▱▱▱▱▱');
    // 40/100 * 5 = 2 → exato
    expect(barraProgresso(40, 100, 5)).toBe('▰▰▱▱▱');
  });

  it('arredonda proporcionalmente em valores nao-inteiros', () => {
    // 47/100 = 4.7 → 5 cheios
    expect(barraProgresso(47, 100)).toBe('▰▰▰▰▰▱▱▱▱▱');
    // 44/100 = 4.4 → 4 cheios
    expect(barraProgresso(44, 100)).toBe('▰▰▰▰▱▱▱▱▱▱');
  });
});

describe('microMensagemFinal', () => {
  const metas: MacrosDiarios = {
    kcal: 2000,
    proteina_g: 150,
    carbo_g: 250,
    gordura_g: 60,
  };

  it('estado abaixo: destaca proteina quando falta mais de 30%', () => {
    const saldo = { kcal: 1000, proteina_g: 50, carbo_g: 150, gordura_g: 30 };
    const msg = microMensagemFinal(saldo, metas);
    expect(msg).toContain('proteína');
    expect(msg).toContain('100g'); // 150 - 50
    expect(msg).toContain('1000 kcal'); // 2000 - 1000
  });

  it('estado abaixo: so kcal quando proteina nao esta atrasada', () => {
    const saldo = { kcal: 1000, proteina_g: 120, carbo_g: 150, gordura_g: 30 };
    const msg = microMensagemFinal(saldo, metas);
    expect(msg).not.toContain('proteína');
    expect(msg).toContain('1000 kcal');
  });

  it('estado perto: reta final quando kcal >= 85% sem ter batido proteina', () => {
    const saldo = { kcal: 1750, proteina_g: 100, carbo_g: 220, gordura_g: 50 };
    const msg = microMensagemFinal(saldo, metas);
    expect(msg).toContain('Reta final');
    expect(msg).toContain('250 kcal'); // 2000 - 1750
  });

  it('estado bateu: kcal 95-102% E proteina >= meta', () => {
    const saldo = { kcal: 1950, proteina_g: 155, carbo_g: 245, gordura_g: 58 };
    const msg = microMensagemFinal(saldo, metas);
    expect(msg).toContain('Meta do dia batida');
  });

  it('estado perto do limite: kcal 103-110% — bateu mas passou pouco', () => {
    // 2080 / 2000 = 104%
    const saldo = { kcal: 2080, proteina_g: 160, carbo_g: 260, gordura_g: 60 };
    const msg = microMensagemFinal(saldo, metas);
    expect(msg).toContain('Meta batida');
    expect(msg).toContain('80 kcal'); // 2080 - 2000
    expect(msg).toContain('margem');
    expect(msg).not.toContain('amanhã equilibra');
  });

  it('estado ultrapassou: kcal > 110% — gentil, sem culpa', () => {
    const saldo = { kcal: 2300, proteina_g: 160, carbo_g: 300, gordura_g: 70 };
    const msg = microMensagemFinal(saldo, metas);
    expect(msg).toContain('passou');
    expect(msg).toContain('300 kcal'); // 2300 - 2000
    expect(msg).toContain('amanhã equilibra');
    // Nao pode ter linguagem de culpa/alarme
    expect(msg.toLowerCase()).not.toContain('errou');
    expect(msg.toLowerCase()).not.toContain('cuidado');
    expect(msg.toLowerCase()).not.toContain('exagerou');
  });

  it('proteina alta nao supera kcal ultrapassada (ultrapassou tem prioridade)', () => {
    const saldo = { kcal: 2400, proteina_g: 200, carbo_g: 280, gordura_g: 65 };
    const msg = microMensagemFinal(saldo, metas);
    expect(msg).toContain('passou');
    expect(msg).not.toContain('Meta do dia batida');
  });

  it('retorna string vazia quando metas.kcal <= 0 (sem entrevista concluida)', () => {
    const metasVazias: MacrosDiarios = { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 };
    expect(microMensagemFinal({ kcal: 100, proteina_g: 10, carbo_g: 10, gordura_g: 5 }, metasVazias)).toBe('');
  });
});
