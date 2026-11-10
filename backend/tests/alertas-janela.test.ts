import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resultado = { data: unknown; error: null | { message: string } };

const { resultados, sendText, updates } = vi.hoisted(() => ({
  resultados: {} as Record<string, Resultado>,
  sendText: vi.fn(),
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock('@supabase/supabase-js', () => {
  function chainPara(table: string) {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'order', 'limit']) chain[m] = () => chain;
    chain.update = (values: Record<string, unknown>) => {
      updates.push({ table, values });
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve(resultados[table] ?? { data: [], error: null });
    return chain;
  }
  return {
    createClient: vi.fn(() => ({
      from: (t: string) => chainPara(t),
      rpc: (fn: string) => chainPara(`rpc:${fn}`),
    })),
  };
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

// Máximo por paciente via RPC: buscar todas as refeições estourava o max_rows do PostgREST.
const ULTIMA = 'rpc:ultima_refeicao_por_paciente';

describe('dispararAlertas', () => {
  const paciente = {
    whatsapp: '5562999990000',
    nome: 'Teste',
    ativo: true,
    created_at: '2026-01-01T00:00:00Z',
    entrevista_dados: { hidratacao_ml: 2000 },
  };
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
    updates.length = 0;
    resultados.alertas_config = { data: [{ ...configBase, ultimo_reengajamento_em: null }], error: null };
    resultados.registros_diarios = { data: [], error: null };
    // Ativo: comeu há 4 h.
    resultados[ULTIMA] = {
      data: [{ paciente_id: 'p1', ultima: new Date(Date.now() - 4 * 3600_000).toISOString() }],
      error: null,
    };
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

  it('erro do Supabase ao buscar configs não envia nada', async () => {
    resultados.alertas_config = { data: null, error: { message: 'falhou' } };
    await dispararAlertas('12:15');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('água pulada quando a meta do dia já foi batida', async () => {
    resultados.registros_diarios = { data: [{ paciente_id: 'p1', agua_ml: 2000 }], error: null };
    await dispararAlertas('12:15');
    const textos = sendText.mock.calls.map((c) => c[1] as string).join('\n');
    expect(sendText).toHaveBeenCalledTimes(2); // almoço + suplemento
    expect(textos).not.toContain('hidratar');
  });

  it('almoço pulado quando já registrou refeição há menos de 1 h', async () => {
    resultados[ULTIMA] = {
      data: [{ paciente_id: 'p1', ultima: new Date(Date.now() - 20 * 60_000).toISOString() }],
      error: null,
    };
    await dispararAlertas('12:15');
    const textos = sendText.mock.calls.map((c) => c[1] as string).join('\n');
    expect(textos).not.toContain('almoço');
    expect(sendText).toHaveBeenCalledTimes(2); // água + suplemento
  });

  it('inativo há dias recebe só o reengajamento no horário do almoço e marca a data', async () => {
    resultados[ULTIMA] = { data: [], error: null };
    await dispararAlertas('12:15');
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][1]).toContain('Sumiu?');
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe('alertas_config');
    expect(updates[0].values).toHaveProperty('ultimo_reengajamento_em');
  });

  it('inativo fora do horário do almoço não recebe nada', async () => {
    resultados[ULTIMA] = { data: [], error: null };
    await dispararAlertas('07:00');
    expect(sendText).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('falha ao carregar contexto mantém o comportamento antigo', async () => {
    resultados[ULTIMA] = { data: null, error: { message: 'timeout' } };
    await dispararAlertas('12:15');
    expect(sendText).toHaveBeenCalledTimes(3);
    expect(updates).toHaveLength(0);
  });
});
