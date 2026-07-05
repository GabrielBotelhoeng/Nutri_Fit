import { describe, it, expect, vi } from 'vitest';

// agent.ts instancia Anthropic/Supabase e importa rag (pdf-parse) no
// top-level — mesmos mocks do agent-etapa14.test.ts.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: class {
    async embedDocuments() { return []; }
    async embedQuery() { return []; }
  },
}));

vi.mock('../src/services/rag', () => ({
  buscarHorariosDietaPaciente: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

import { avisoVencimentoPendente } from '../src/services/agent';
import type { PacienteInfo } from '../src/services/conversation';

// Relogio fixo: meio-dia UTC de 2026-07-05. data_expiracao vira Date em
// meia-noite UTC do dia, entao 07-07 esta a 1.5 dias → ceil = 2.
const AGORA = new Date('2026-07-05T12:00:00Z').getTime();
const HOJE = '2026-07-05';

function paciente(over: Partial<PacienteInfo> = {}): PacienteInfo {
  return {
    id: 'pac-1',
    nome: 'Paciente Teste',
    whatsapp: '5562999999999',
    ativo: true,
    data_expiracao: '2026-07-07',
    entrevista_status: 'completa',
    entrevista_etapa: 14,
    entrevista_dados: {},
    ...over,
  };
}

describe('avisoVencimentoPendente — lembrete de vencimento no maximo 1x/dia', () => {
  it('vence em 2 dias → avisa com "2 dias"', () => {
    const msg = avisoVencimentoPendente(paciente(), HOJE, AGORA);
    expect(msg).toContain('*2 dias*');
  });

  it('vence amanha → "1 dia" no singular', () => {
    const msg = avisoVencimentoPendente(paciente({ data_expiracao: '2026-07-06' }), HOJE, AGORA);
    expect(msg).toContain('*1 dia*');
  });

  it('ja avisou hoje → null (nao repete a cada mensagem)', () => {
    const p = paciente({ entrevista_dados: { ultimo_aviso_expiracao: HOJE } });
    expect(avisoVencimentoPendente(p, HOJE, AGORA)).toBeNull();
  });

  it('aviso de ontem nao bloqueia o de hoje', () => {
    const p = paciente({ entrevista_dados: { ultimo_aviso_expiracao: '2026-07-04' } });
    expect(avisoVencimentoPendente(p, HOJE, AGORA)).toContain('vence em');
  });

  it('vence em mais de 3 dias → null', () => {
    expect(avisoVencimentoPendente(paciente({ data_expiracao: '2026-07-10' }), HOJE, AGORA)).toBeNull();
  });

  it('ja vencido → null (bloqueio e de outra camada)', () => {
    expect(avisoVencimentoPendente(paciente({ data_expiracao: '2026-07-04' }), HOJE, AGORA)).toBeNull();
  });

  it('sem data_expiracao → null', () => {
    expect(avisoVencimentoPendente(paciente({ data_expiracao: '' }), HOJE, AGORA)).toBeNull();
  });
});
