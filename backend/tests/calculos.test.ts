import { describe, it, expect, vi } from 'vitest';

// O calculos.ts instancia o Anthropic no top-level; gerarExplicacaoPersonalizada
// nao e testada aqui (precisa rede), mas o construtor precisa funcionar.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

import {
  detectarFatorAtividade,
  extrairFrequenciaSemanal,
  classificarTipoAtividade,
  sanitizarMencaoConcorrentes,
} from '../src/services/calculos';

describe('extrairFrequenciaSemanal', () => {
  it('"5x" extrai 5', () => {
    expect(extrairFrequenciaSemanal('musculacao 5x')).toBe(5);
  });

  it('"3 vezes" extrai 3', () => {
    expect(extrairFrequenciaSemanal('treino 3 vezes na semana')).toBe(3);
  });

  it('"cinco vezes" extrai 5 por extenso', () => {
    expect(extrairFrequenciaSemanal('musculacao cinco vezes')).toBe(5);
  });

  it('"duas vezes" extrai 2', () => {
    expect(extrairFrequenciaSemanal('caminhada duas vezes na semana')).toBe(2);
  });

  it('"todo dia" → 7', () => {
    expect(extrairFrequenciaSemanal('treino todo dia')).toBe(7);
  });

  it('"diario" → 7', () => {
    expect(extrairFrequenciaSemanal('musculacao diario')).toBe(7);
  });

  it('"2 vezes ao dia" → 7', () => {
    expect(extrairFrequenciaSemanal('treino 2 vezes ao dia')).toBe(7);
  });

  it('"nao pratico" → 0', () => {
    expect(extrairFrequenciaSemanal('nao pratico nada')).toBe(0);
  });

  it('texto sem frequencia → null', () => {
    expect(extrairFrequenciaSemanal('musculacao')).toBe(null);
  });
});

describe('classificarTipoAtividade', () => {
  it('"sedentario" → sedentario', () => {
    expect(classificarTipoAtividade('sou sedentario')).toBe('sedentario');
  });

  it('"musculacao" → moderado', () => {
    expect(classificarTipoAtividade('musculacao')).toBe('moderado');
  });

  it('"caminhada" → leve', () => {
    expect(classificarTipoAtividade('caminhada')).toBe('leve');
  });

  it('"atletismo" → intenso', () => {
    expect(classificarTipoAtividade('atletismo profissional')).toBe('intenso');
  });

  it('"crossfit" → intenso', () => {
    expect(classificarTipoAtividade('crossfit')).toBe('intenso');
  });

  it('"nao pratico" → sedentario', () => {
    expect(classificarTipoAtividade('nao pratico esporte')).toBe('sedentario');
  });

  it('texto vazio → desconhecido', () => {
    expect(classificarTipoAtividade('')).toBe('desconhecido');
  });
});

describe('detectarFatorAtividade — casos do criterio P1-4', () => {
  // Caso-bug que motivou o P1-4:
  it('musculacao 5x → 1.725 (era 1.55 — bug)', () => {
    const r = detectarFatorAtividade('musculacao', '5x');
    expect(r.fator).toBe(1.725);
    expect(r.nivel).toBe('Muito ativo');
  });

  it('musculacao 3x → 1.55', () => {
    const r = detectarFatorAtividade('musculacao', '3x');
    expect(r.fator).toBe(1.55);
    expect(r.nivel).toBe('Moderadamente ativo');
  });

  it('caminhada 2x → 1.375', () => {
    const r = detectarFatorAtividade('caminhada', '2x');
    expect(r.fator).toBe(1.375);
    expect(r.nivel).toBe('Levemente ativo');
  });

  it('sedentario → 1.2 (sem precisar de frequencia)', () => {
    const r = detectarFatorAtividade('sedentario');
    expect(r.fator).toBe(1.2);
    expect(r.nivel).toBe('Sedentario');
  });

  it('"nao pratico" → 1.2', () => {
    const r = detectarFatorAtividade('nao pratico nada');
    expect(r.fator).toBe(1.2);
  });

  it('musculacao 7x → 1.9 extremo', () => {
    const r = detectarFatorAtividade('musculacao', '7x');
    expect(r.fator).toBe(1.9);
    expect(r.nivel).toBe('Extremamente ativo');
  });

  it('treino todo dia → 1.9', () => {
    const r = detectarFatorAtividade('musculacao', 'todo dia');
    expect(r.fator).toBe(1.9);
  });

  it('musculacao 4x → 1.55 (limite superior de moderado)', () => {
    const r = detectarFatorAtividade('musculacao', '4x');
    expect(r.fator).toBe(1.55);
  });

  it('musculacao 6x → 1.725 (limite superior de muito ativo)', () => {
    const r = detectarFatorAtividade('musculacao', '6x');
    expect(r.fator).toBe(1.725);
  });

  it('musculacao 1x → 1.375', () => {
    const r = detectarFatorAtividade('musculacao', '1x');
    expect(r.fator).toBe(1.375);
  });

  it('musculacao sem frequencia → 1.55 (default seguro)', () => {
    const r = detectarFatorAtividade('musculacao');
    expect(r.fator).toBe(1.55);
  });

  it('caminhada sem frequencia → 1.375 (default leve)', () => {
    const r = detectarFatorAtividade('caminhada');
    expect(r.fator).toBe(1.375);
  });

  it('crossfit 4x → 1.55 (freq domina o tipo)', () => {
    const r = detectarFatorAtividade('crossfit', '4x');
    expect(r.fator).toBe(1.55);
  });

  it('crossfit sem frequencia → 1.725 (tipo intenso orienta default)', () => {
    const r = detectarFatorAtividade('crossfit');
    expect(r.fator).toBe(1.725);
  });

  it('sedentario com "5x" sobrescreve → 1.2 (caso degenerado)', () => {
    // Paciente que se autodeclara sedentario mas escreve "5x" em algum campo —
    // a autodeclaracao ganha. Decisao conservadora; evita superestimar.
    const r = detectarFatorAtividade('sedentario', '5x na semana');
    expect(r.fator).toBe(1.2);
  });

  it('"cinco vezes" por extenso → 1.725', () => {
    const r = detectarFatorAtividade('musculacao', 'cinco vezes na semana');
    expect(r.fator).toBe(1.725);
  });
});

describe('sanitizarMencaoConcorrentes — P1-5', () => {
  it('remove sentenca que menciona MyFitnessPal', () => {
    const entrada =
      'Sua meta calorica faz sentido pro emagrecimento. Recomendo mapear suas refeicoes no MyFitnessPal. Continue firme!';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).not.toMatch(/myfitnesspal/i);
    expect(saida).toContain('Sua meta');
    expect(saida).toContain('Continue firme');
  });

  it('adiciona dica on-brand quando remove menção', () => {
    const entrada = 'Use MyFitnessPal pra controlar.';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).toMatch(/foto.*prato|audio.*descrev/i);
  });

  it('barra FatSecret', () => {
    const entrada = 'Considere usar o FatSecret pra acompanhar.';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).not.toMatch(/fatsecret/i);
  });

  it('barra Cronometer', () => {
    const entrada = 'O Cronometer ajuda a contar.';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).not.toMatch(/cronometer/i);
  });

  it('barra "Lose It"', () => {
    const entrada = 'Considere o Lose It como ferramenta.';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).not.toMatch(/lose\s*it/i);
  });

  it('barra Yazio', () => {
    const entrada = 'Voce pode usar Yazio se quiser.';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).not.toMatch(/yazio/i);
  });

  it('barra "contador de calorias"', () => {
    const entrada = 'Use um contador de calorias.';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).not.toMatch(/contador de calorias/i);
  });

  it('texto sem concorrente passa inalterado', () => {
    const entrada = 'Sua meta faz sentido. Continue firme e me manda foto do prato.';
    expect(sanitizarMencaoConcorrentes(entrada)).toBe(entrada);
  });

  it('case-insensitive e tolerante a espacos', () => {
    const entrada = 'Use o My Fitness Pal pra mapear.';
    const saida = sanitizarMencaoConcorrentes(entrada);
    expect(saida).not.toMatch(/my\s*fitness\s*pal/i);
  });
});

