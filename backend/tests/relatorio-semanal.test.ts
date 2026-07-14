import { describe, it, expect, vi } from 'vitest';

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

import {
  statusDia,
  barraKcalDia,
  diaSemanaBR,
  formatarDataRangeBR,
  formatarMensagemRelatorio,
} from '../src/services/relatorio';
import type { MacrosDiarios } from '../src/services/calculos';

describe('statusDia', () => {
  const meta = 2000;
  it('sem_registro quando kcal = 0', () => expect(statusDia(0, meta)).toBe('sem_registro'));
  it('sem_registro quando meta <= 0', () => expect(statusDia(1500, 0)).toBe('sem_registro'));
  it('acima quando > 110% da meta', () => expect(statusDia(2201, meta)).toBe('acima'));
  it('na_meta em 90-110%', () => {
    expect(statusDia(1800, meta)).toBe('na_meta');
    expect(statusDia(2000, meta)).toBe('na_meta');
    expect(statusDia(2200, meta)).toBe('na_meta');
  });
  it('abaixo em 70-90%', () => {
    expect(statusDia(1400, meta)).toBe('abaixo');
    expect(statusDia(1799, meta)).toBe('abaixo');
  });
  it('bem_abaixo abaixo de 70%', () => expect(statusDia(1000, meta)).toBe('bem_abaixo'));
});

describe('barraKcalDia', () => {
  it('vazia quando kcal = 0', () => expect(barraKcalDia(0, 2000)).toBe('░'.repeat(10)));
  it('vazia quando meta <= 0', () => expect(barraKcalDia(1500, 0)).toBe('░'.repeat(10)));
  it('cheia sem overflow em 100% da meta', () => expect(barraKcalDia(2000, 2000)).toBe('█'.repeat(10)));
  it('metade preenchida em 50%', () => expect(barraKcalDia(1000, 2000)).toBe('█████░░░░░'));
  it('cheia sem marcador ate 110%', () => {
    expect(barraKcalDia(2100, 2000)).toBe('█'.repeat(10));
    expect(barraKcalDia(2200, 2000)).toBe('█'.repeat(10));
  });
  it('marcador ▶ quando ultrapassa 110%', () => {
    expect(barraKcalDia(2300, 2000)).toBe('█'.repeat(10) + '▶');
    expect(barraKcalDia(3500, 2000)).toBe('█'.repeat(10) + '▶');
  });
});

describe('diaSemanaBR', () => {
  it('mapeia weekdays em portugues abreviado', () => {
    // 2026-07-13 = segunda-feira
    expect(diaSemanaBR('2026-07-13')).toBe('Seg');
    expect(diaSemanaBR('2026-07-14')).toBe('Ter');
    expect(diaSemanaBR('2026-07-15')).toBe('Qua');
    expect(diaSemanaBR('2026-07-16')).toBe('Qui');
    expect(diaSemanaBR('2026-07-17')).toBe('Sex');
    expect(diaSemanaBR('2026-07-18')).toBe('Sáb');
    expect(diaSemanaBR('2026-07-19')).toBe('Dom');
  });
});

describe('formatarDataRangeBR', () => {
  it('formata como DD/mes → DD/mes', () => {
    expect(formatarDataRangeBR('2026-03-29', '2026-04-04')).toBe('29/mar → 04/abr');
    expect(formatarDataRangeBR('2026-01-01', '2026-01-07')).toBe('01/jan → 07/jan');
    expect(formatarDataRangeBR('2026-12-25', '2026-12-31')).toBe('25/dez → 31/dez');
  });
});

describe('formatarMensagemRelatorio', () => {
  const metas: MacrosDiarios = {
    kcal: 2000,
    proteina_g: 120,
    carbo_g: 220,
    gordura_g: 65,
    proteina_pct: 24,
    carbo_pct: 44,
    gordura_pct: 32,
    agua_ml: 2500,
  };

  const diasBase = [
    { data: '2026-03-29', kcal: 1820, proteina: 100, carbo: 180, gordura: 55, agua: 2000 }, // Dom na_meta
    { data: '2026-03-30', kcal: 2050, proteina: 115, carbo: 200, gordura: 60, agua: 2100 }, // Seg na_meta
    { data: '2026-03-31', kcal: 790, proteina: 40, carbo: 80, gordura: 25, agua: 1200 }, // Ter bem_abaixo
    { data: '2026-04-01', kcal: 2450, proteina: 130, carbo: 260, gordura: 75, agua: 2200 }, // Qua acima
    { data: '2026-04-02', kcal: 1970, proteina: 110, carbo: 190, gordura: 58, agua: 2000 }, // Qui na_meta
    { data: '2026-04-03', kcal: 1500, proteina: 80, carbo: 150, gordura: 45, agua: 1800 }, // Sex abaixo (75%)
    { data: '2026-04-04', kcal: 2380, proteina: 125, carbo: 250, gordura: 70, agua: 2100 }, // Sab acima
  ];

  it('inclui bloco de alerta no topo quando ha dias acima', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 1580,
      streak: undefined,
      incentivo: 'Boa semana!',
    });
    expect(msg).toContain('🔴 *Atenção:*');
    expect(msg).toContain('ultrapassou a meta em 2 dias');
    expect(msg).toContain('Qua'); // 2026-04-01 = quarta
    expect(msg).toContain('Sáb'); // 2026-04-04 = sabado
  });

  it('nao inclui alerta quando nenhum dia ultrapassa', () => {
    const diasSemAcima = diasBase.map((d) => ({ ...d, kcal: Math.min(d.kcal, 2100) }));
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Ana',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasSemAcima,
      metas,
      mediaAtual: 1700,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Continue firme!',
    });
    expect(msg).not.toContain('🔴 *Atenção:*');
  });

  it('inclui comparacao com semana anterior quando ha dado', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 1580,
      streak: undefined,
      incentivo: 'Boa semana!',
    });
    expect(msg).toContain('Semana anterior: 1580 kcal');
    expect(msg).toContain('+15.8%');
  });

  it('omite comparacao quando semana anterior nao tem dado', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Boa semana!',
    });
    expect(msg).not.toContain('Semana anterior');
  });

  it('mostra streak quando >= 2 dias', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 1580,
      streak: { proteina: 4, kcal: 2, batendo_hoje_proteina: true, batendo_hoje_kcal: false },
      incentivo: 'Boa!',
    });
    expect(msg).toContain('Streak atual');
    expect(msg).toContain('4 dias');
  });

  it('omite streak quando < 2 dias', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 0,
      streak: { proteina: 1, kcal: 0, batendo_hoje_proteina: true, batendo_hoje_kcal: false },
      incentivo: 'Boa!',
    });
    expect(msg).not.toContain('Streak atual');
  });

  it('mostra grafico ASCII dentro de bloco de codigo com emoji por dia', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Boa!',
    });
    expect(msg).toMatch(/```[\s\S]*Dom[\s\S]*Seg[\s\S]*Sáb[\s\S]*```/);
    expect(msg).toContain('▶'); // overflow em Qua e Sab
    expect(msg).toContain('✅'); // dias na meta
    expect(msg).toContain('🔴'); // dias acima
    expect(msg).toContain('❌'); // Ter bem_abaixo
    expect(msg).toContain('⚠️'); // Sex abaixo
  });

  it('inclui macros com percentual da meta', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Boa!',
    });
    expect(msg).toContain('Proteína:');
    expect(msg).toContain('/ 120g');
    expect(msg).toContain('Carbo:');
    expect(msg).toContain('Gordura:');
    expect(msg).toMatch(/\(\d+%\)/);
  });

  it('inclui hidratacao com meta quando disponivel', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Boa!',
    });
    expect(msg).toContain('💧 *Hidratação:*');
    expect(msg).toContain('meta 2500 ml');
  });

  it('mostra hidratacao sem meta quando agua_ml ausente', () => {
    const metasSemAgua: MacrosDiarios = { ...metas, agua_ml: undefined };
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas: metasSemAgua,
      mediaAtual: 1830,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Boa!',
    });
    expect(msg).toContain('💧 *Hidratação:*');
    expect(msg).not.toContain('meta 2500');
  });

  it('inclui melhor e pior dia', () => {
    const msg = formatarMensagemRelatorio({
      nomePaciente: 'Gabriel',
      dataInicio: '2026-03-29',
      dataFim: '2026-04-04',
      dias: diasBase,
      metas,
      mediaAtual: 1830,
      mediaAnterior: 0,
      streak: undefined,
      incentivo: 'Boa!',
    });
    expect(msg).toContain('Melhor dia:');
    expect(msg).toContain('Pior dia:');
    // Qua = 2450 (maior); Ter = 790 (menor)
    expect(msg).toContain('2450 kcal');
    expect(msg).toContain('790 kcal');
  });
});
