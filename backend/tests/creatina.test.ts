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

// Agentes de teste 2026-10-23 (Seu Antônio, 61 anos, sedentário, diabético, sem
// suplementos): a mensagem de números sugeria "4,5 g/dia" de creatina mesmo ele não
// usando. Sem creatina na lista, não há dose e a linha não aparece.
import { formatarMensagemCalculos, calcularTMB, calcularMacros, calcularHidratacao } from '../src/services/calculos';

describe('creatina para quem não usa', () => {
  it('sem creatina nos suplementos → dose 0', () => {
    expect(calcularCreatina(92, []).dose_g).toBe(0);
    expect(calcularCreatina(92, undefined).dose_g).toBe(0);
    expect(calcularCreatina(92, ['whey']).dose_g).toBe(0);
  });

  it('mensagem de números não fala de creatina quando a dose é 0', () => {
    const dados = { idade: 61, sexo: 'masculino', peso_kg: 92, altura_cm: 175, atividade_tipo: 'sedentário' };
    const tmb = calcularTMB(dados as Parameters<typeof calcularTMB>[0]);
    const msg = formatarMensagemCalculos(tmb, calcularMacros(tmb.tdee_kcal, 'saude_geral', 92), calcularHidratacao(92), calcularCreatina(92, []));
    expect(msg).not.toMatch(/creatina/i);
  });
});
