import { describe, it, expect } from 'vitest';
import { calcularCreatina } from '../src/services/calculos';

// Agentes de teste 2026-10-23 (onboarding Juliana, 68 kg): a mensagem de números dizia
// "2g/dia (0,03g/kg)" e a de suplementos, logo depois, "3-5g/dia". Dose calculada agora
// fica sempre na faixa padrão de manutenção (3–5 g/dia), igual à mensagem de suplementos.

describe('calcularCreatina', () => {
  it.each([
    [50, 3],
    [68, 3.5],
    [80, 4],
    [100, 5],
    [130, 5],
  ])('%i kg → %s g/dia (sempre entre 3 e 5)', (peso, dose) => {
    expect(calcularCreatina(peso, ['creatina']).dose_g).toBe(dose);
  });

  it('mensagem cita a faixa 3–5 g/dia, sem contradizer a de suplementos', () => {
    const m = calcularCreatina(68, ['creatina']).mensagem;
    expect(m).toMatch(/3[–-]5\s*g/);
    expect(m).not.toMatch(/0,03/);
  });

  it('dose prescrita pelo nutricionista continua valendo', () => {
    expect(calcularCreatina(68, ['creatina 2g']).dose_g).toBe(2);
  });
});
