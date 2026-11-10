import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }));
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));

import { decidirAlertas, type ContextoDecisao } from '../src/services/alertas';

const AGORA = new Date('2026-11-09T15:20:00Z'); // 12:20 BRT
const horasAtras = (h: number): Date => new Date(AGORA.getTime() - h * 3600_000);
const minAtras = (m: number): Date => new Date(AGORA.getTime() - m * 60_000);

function ctx(over: Partial<ContextoDecisao> = {}): ContextoDecisao {
  return {
    agora: AGORA,
    refeicoesCasadas: ['almoco'],
    aguaCasou: true,
    suplementoCasou: true,
    disparoDoReengajamento: true,
    aguaHojeMl: 500,
    metaAguaMl: 2000,
    ultimaRefeicaoEm: horasAtras(4),
    pacienteCriadoEm: horasAtras(24 * 30),
    ultimoReengajamentoEm: null,
    ...over,
  };
}

describe('decidirAlertas', () => {
  it('paciente ativo sem nada feito recebe tudo que casou', () => {
    expect(decidirAlertas(ctx())).toEqual({
      refeicoes: ['almoco'], agua: true, suplemento: true, reengajar: false,
    });
  });

  describe('regra 1 — água', () => {
    it('meta batida pula a água', () => {
      expect(decidirAlertas(ctx({ aguaHojeMl: 2000 })).agua).toBe(false);
      expect(decidirAlertas(ctx({ aguaHojeMl: 2500 })).agua).toBe(false);
    });
    it('abaixo da meta mantém', () => {
      expect(decidirAlertas(ctx({ aguaHojeMl: 1999 })).agua).toBe(true);
    });
    it('sem meta de hidratação nunca pula', () => {
      expect(decidirAlertas(ctx({ metaAguaMl: 0, aguaHojeMl: 5000 })).agua).toBe(true);
    });
    it('água que não casou continua false', () => {
      expect(decidirAlertas(ctx({ aguaCasou: false })).agua).toBe(false);
    });
  });

  describe('regra 2 — refeição recente', () => {
    it('refeição há 59 min pula o lembrete de refeição', () => {
      expect(decidirAlertas(ctx({ ultimaRefeicaoEm: minAtras(59) })).refeicoes).toEqual([]);
    });
    it('refeição há exatamente 60 min mantém', () => {
      expect(decidirAlertas(ctx({ ultimaRefeicaoEm: minAtras(60) })).refeicoes).toEqual(['almoco']);
    });
    it('refeição recente não afeta água nem suplemento', () => {
      const d = decidirAlertas(ctx({ ultimaRefeicaoEm: minAtras(10) }));
      expect(d.agua).toBe(true);
      expect(d.suplemento).toBe(true);
    });
  });

  describe('regra 3 — reengajamento', () => {
    const inativo = { ultimaRefeicaoEm: horasAtras(48) };

    it('inativo há 48 h: silencia rotina e reengaja', () => {
      expect(decidirAlertas(ctx(inativo))).toEqual({
        refeicoes: [], agua: false, suplemento: false, reengajar: true,
      });
    });
    it('47 h sem registrar ainda é ativo', () => {
      expect(decidirAlertas(ctx({ ultimaRefeicaoEm: horasAtras(47) })).reengajar).toBe(false);
    });
    it('inativo fora do horário de reengajamento: só silencia', () => {
      expect(decidirAlertas(ctx({ ...inativo, disparoDoReengajamento: false }))).toEqual({
        refeicoes: [], agua: false, suplemento: false, reengajar: false,
      });
    });
    it('já reengajado nesta sequência não repete', () => {
      const d = decidirAlertas(ctx({ ...inativo, ultimoReengajamentoEm: horasAtras(24) }));
      expect(d.reengajar).toBe(false);
    });
    it('voltou a registrar depois do reengajamento e sumiu de novo: reengaja de novo', () => {
      const d = decidirAlertas(ctx({
        ultimaRefeicaoEm: horasAtras(72),
        ultimoReengajamentoEm: horasAtras(24 * 10),
      }));
      expect(d.reengajar).toBe(true);
    });
    it('nunca registrou e foi cadastrado há menos de 48 h: lembretes normais', () => {
      const d = decidirAlertas(ctx({ ultimaRefeicaoEm: null, pacienteCriadoEm: horasAtras(10) }));
      expect(d).toEqual({ refeicoes: ['almoco'], agua: true, suplemento: true, reengajar: false });
    });
    it('nunca registrou e foi cadastrado há 3 dias: reengaja', () => {
      const d = decidirAlertas(ctx({ ultimaRefeicaoEm: null, pacienteCriadoEm: horasAtras(72) }));
      expect(d.reengajar).toBe(true);
    });
    it('nunca registrou e já foi reengajado: não repete', () => {
      const d = decidirAlertas(ctx({
        ultimaRefeicaoEm: null,
        pacienteCriadoEm: horasAtras(72),
        ultimoReengajamentoEm: horasAtras(20),
      }));
      expect(d.reengajar).toBe(false);
    });
  });
});
