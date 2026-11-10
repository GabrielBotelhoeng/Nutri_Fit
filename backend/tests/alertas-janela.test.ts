import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resultado, sendText } = vi.hoisted(() => ({
  resultado: { data: [] as unknown[], error: null as null | { message: string } },
  sendText: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (v: unknown) => unknown) => resolve(resultado),
  };
  return { createClient: vi.fn(() => ({ from: () => chain })) };
});
vi.mock('../src/services/evolution', () => ({ sendText }));

import { horarioNaJanela, dispararAlertas } from '../src/services/alertas';

describe('horarioNaJanela', () => {
  it('casa o horário exato da grade', () => {
    expect(horarioNaJanela('12:00', '12:00')).toBe(true);
    expect(horarioNaJanela('07:30', '07:30')).toBe(true);
  });

  it('casa horário fora da grade no quarto de hora do disparo', () => {
    expect(horarioNaJanela('12:20', '12:15')).toBe(true);
    expect(horarioNaJanela('12:29', '12:15')).toBe(true);
  });

  it('não casa no quarto de hora vizinho', () => {
    expect(horarioNaJanela('12:20', '12:00')).toBe(false);
    expect(horarioNaJanela('12:30', '12:15')).toBe(false);
    expect(horarioNaJanela('12:14', '12:15')).toBe(false);
  });

  it('tolera disparo atrasado do N8N', () => {
    expect(horarioNaJanela('12:15', '12:16')).toBe(true);
    expect(horarioNaJanela('12:00', '12:14')).toBe(true);
  });

  it('aceita segundos e hora com 1 dígito', () => {
    expect(horarioNaJanela('7:05', '07:00')).toBe(true);
    expect(horarioNaJanela('19:30:00', '19:30')).toBe(true);
  });

  it('virada da meia-noite fica no quarto de hora certo', () => {
    expect(horarioNaJanela('23:50', '23:45')).toBe(true);
    expect(horarioNaJanela('00:05', '23:45')).toBe(false);
    expect(horarioNaJanela('00:05', '00:00')).toBe(true);
  });

  it('ignora vazio ou inválido', () => {
    expect(horarioNaJanela(null, '12:00')).toBe(false);
    expect(horarioNaJanela('', '12:00')).toBe(false);
    expect(horarioNaJanela('meio-dia', '12:00')).toBe(false);
    expect(horarioNaJanela('25:00', '12:00')).toBe(false);
  });
});

describe('dispararAlertas', () => {
  const paciente = { whatsapp: '5562999990000', nome: 'Teste', ativo: true, entrevista_dados: { hidratacao_ml: 2000 } };
  const configBase = {
    paciente_id: 'p1',
    horario_cafe: '07:10',
    horario_lanche_manha: null,
    horario_almoco: '12:20',
    horario_lanche_tarde: null,
    horario_jantar: '19:00',
    horarios_agua: ['07:10', '12:20', '15:00', '19:00'],
    horario_suplementos: ['12:20'],
    pacientes: paciente,
  };

  beforeEach(() => {
    sendText.mockReset();
    resultado.data = [configBase];
    resultado.error = null;
  });

  it('dispara almoço, água e suplemento de 12:20 no cron de 12:15', async () => {
    await dispararAlertas('12:15');
    expect(sendText).toHaveBeenCalledTimes(3);
    const textos = sendText.mock.calls.map((c) => c[1] as string).join('\n');
    expect(textos).toContain('~500ml'); // 2000 ml / 4 horários
  });

  it('não dispara nada no quarto de hora seguinte', async () => {
    await dispararAlertas('12:30');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('café de 07:10 sai no cron de 07:00', async () => {
    await dispararAlertas('07:00');
    expect(sendText).toHaveBeenCalledTimes(2); // café + água
  });

  it('erro do Supabase não envia nada', async () => {
    resultado.error = { message: 'falhou' };
    await dispararAlertas('12:15');
    expect(sendText).not.toHaveBeenCalled();
  });
});
