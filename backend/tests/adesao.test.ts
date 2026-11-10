import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn(), rpc: vi.fn() })) }));

import { resumirAdesao, type EntradaAdesao } from '../src/services/adesao';

const AGORA = new Date('2026-11-09T15:00:00Z'); // 12:00 BRT
const HOJE = '2026-11-09';
const horasAtras = (h: number): Date => new Date(AGORA.getTime() - h * 3600_000);

function entrada(over: Partial<EntradaAdesao> = {}): EntradaAdesao {
  return {
    agora: AGORA,
    hoje: HOJE,
    criadoEm: horasAtras(24 * 30),
    expirado: false,
    diasComKcal: ['2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03'],
    ultimaRefeicaoEm: horasAtras(3),
    pesagens: [],
    pesoInicialKg: null,
    ...over,
  };
}

describe('resumirAdesao — adesão 7d', () => {
  it('conta só [hoje−7, hoje−1]; hoje e hoje−8 ficam fora', () => {
    const r = resumirAdesao(entrada({ diasComKcal: ['2026-11-09', '2026-11-08', '2026-11-02', '2026-11-01'] }));
    expect(r.dias_com_registro_7d).toBe(2);
  });
  it('data repetida conta uma vez', () => {
    expect(resumirAdesao(entrada({ diasComKcal: ['2026-11-08', '2026-11-08'] })).dias_com_registro_7d).toBe(1);
  });
  it('último registro sai em ISO', () => {
    expect(resumirAdesao(entrada()).ultimo_registro_em).toBe(horasAtras(3).toISOString());
    expect(resumirAdesao(entrada({ ultimaRefeicaoEm: null })).ultimo_registro_em).toBeNull();
  });
});

describe('resumirAdesao — atenção', () => {
  it('paciente regular não precisa de atenção', () => {
    const r = resumirAdesao(entrada());
    expect(r.precisa_atencao).toBe(false);
    expect(r.motivo).toBeNull();
  });
  it('48 h sem registrar → sem_registro_48h; 47 h não', () => {
    expect(resumirAdesao(entrada({ ultimaRefeicaoEm: horasAtras(48) })).motivo).toBe('sem_registro_48h');
    expect(resumirAdesao(entrada({ ultimaRefeicaoEm: horasAtras(47) })).motivo).toBeNull();
  });
  it('cadastrado hoje e nunca registrou: sem atenção', () => {
    const r = resumirAdesao(entrada({ criadoEm: horasAtras(10), ultimaRefeicaoEm: null, diasComKcal: [] }));
    expect(r.precisa_atencao).toBe(false);
  });
  it('cadastrado há 3 dias e nunca registrou: sem_registro_48h', () => {
    const r = resumirAdesao(entrada({ criadoEm: horasAtras(72), ultimaRefeicaoEm: null, diasComKcal: [] }));
    expect(r.motivo).toBe('sem_registro_48h');
  });
  it('≤ 2 de 7 dias com cadastro antigo → baixa_adesao; 3 dias não', () => {
    expect(resumirAdesao(entrada({ diasComKcal: ['2026-11-08', '2026-11-05'] })).motivo).toBe('baixa_adesao');
    expect(resumirAdesao(entrada({ diasComKcal: ['2026-11-08', '2026-11-05', '2026-11-03'] })).motivo).toBeNull();
  });
  it('baixa adesão não vale para cadastro com menos de 7 dias', () => {
    const r = resumirAdesao(entrada({ criadoEm: horasAtras(24 * 5), diasComKcal: ['2026-11-08'] }));
    expect(r.precisa_atencao).toBe(false);
  });
  it('os dois motivos → sem_registro_48h', () => {
    const r = resumirAdesao(entrada({ ultimaRefeicaoEm: horasAtras(24 * 5), diasComKcal: [] }));
    expect(r.motivo).toBe('sem_registro_48h');
  });
  it('plano expirado nunca entra em atenção', () => {
    const r = resumirAdesao(entrada({ expirado: true, ultimaRefeicaoEm: null, diasComKcal: [] }));
    expect(r.precisa_atencao).toBe(false);
    expect(r.motivo).toBeNull();
  });
});

describe('resumirAdesao — peso', () => {
  it('sem pesagem: peso e tendência nulos', () => {
    const r = resumirAdesao(entrada({ pesoInicialKg: 80 }));
    expect(r.peso_atual_kg).toBeNull();
    expect(r.peso_tendencia).toBeNull();
  });
  it('compara com a pesagem anterior', () => {
    const r = resumirAdesao(entrada({
      pesagens: [{ data: '2026-11-01', peso_kg: 79 }, { data: '2026-11-08', peso_kg: 78.4 }],
      pesoInicialKg: 70,
    }));
    expect(r.peso_atual_kg).toBe(78.4);
    expect(r.peso_tendencia).toBe('desceu');
  });
  it('uma pesagem só compara com o peso da entrevista', () => {
    const r = resumirAdesao(entrada({ pesagens: [{ data: '2026-11-08', peso_kg: 80 }], pesoInicialKg: 79 }));
    expect(r.peso_tendencia).toBe('subiu');
  });
  it('variação menor que 0,1 kg é estável', () => {
    const r = resumirAdesao(entrada({
      pesagens: [{ data: '2026-11-01', peso_kg: 78.4 }, { data: '2026-11-08', peso_kg: 78.45 }],
    }));
    expect(r.peso_tendencia).toBe('estavel');
  });
  it('uma pesagem e sem peso de entrevista: tendência nula', () => {
    const r = resumirAdesao(entrada({ pesagens: [{ data: '2026-11-08', peso_kg: 80 }] }));
    expect(r.peso_atual_kg).toBe(80);
    expect(r.peso_tendencia).toBeNull();
  });
});
