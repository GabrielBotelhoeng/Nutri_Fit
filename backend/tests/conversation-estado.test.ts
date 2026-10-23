import { describe, it, expect, vi, beforeEach } from 'vitest';

// Revisão 2026-10-23: getEstado devolvia { status: 'pendente', etapa: 0 } também quando o
// Supabase FALHAVA. processarMensagem lia isso como paciente novo e reiniciava a entrevista
// (status 'em_andamento', etapa 1) de quem já tinha concluído o onboarding.

const { resultado } = vi.hoisted(() => ({
  resultado: { data: null as unknown, error: null as unknown },
}));

vi.mock('@supabase/supabase-js', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => resultado,
  };
  return { createClient: () => ({ from: () => chain }) };
});

import { getEstado } from '../src/services/conversation';

beforeEach(() => {
  resultado.data = null;
  resultado.error = null;
});

describe('getEstado', () => {
  it('falha do banco LANÇA erro em vez de fingir paciente novo', async () => {
    resultado.error = { message: 'connection timeout' };
    await expect(getEstado('pac-1')).rejects.toThrow(/connection timeout/);
  });

  it('paciente sem linha (sem erro) continua pendente', async () => {
    resultado.data = null;
    await expect(getEstado('pac-1')).resolves.toEqual({ status: 'pendente', etapa: 0, dados: {} });
  });

  it('devolve o estado salvo', async () => {
    resultado.data = { entrevista_status: 'completa', entrevista_etapa: 14, entrevista_dados: { peso_kg: 80 } };
    await expect(getEstado('pac-1')).resolves.toEqual({ status: 'completa', etapa: 14, dados: { peso_kg: 80 } });
  });

  it('entrevista_dados nulo vira objeto vazio', async () => {
    resultado.data = { entrevista_status: 'completa', entrevista_etapa: 14, entrevista_dados: null };
    await expect(getEstado('pac-1')).resolves.toMatchObject({ dados: {} });
  });
});
