import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do SDK Anthropic ANTES de importar rag.ts. rag.ts instancia o Anthropic
// no top-level — sem o mock isso bate em rede de verdade.
const { haikuCreateSpy } = vi.hoisted(() => ({
  haikuCreateSpy: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: haikuCreateSpy };
  },
}));

// Mock OpenAIEmbeddings tambem — instanciado no top-level e bate na OpenAI.
vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: class {
    async embedDocuments() { return []; }
    async embedQuery() { return []; }
  },
}));

// pdf-parse tem side-effect no import (`isDebugMode` ativa quando module.parent
// e null no contexto do vitest, tentando ler um PDF de debug que nao existe
// no node_modules instalado). Stub minimo: default export que devolve { text }.
vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({ text: '' })),
}));

// Mock supabase pra nao precisar de credenciais reais
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ download: vi.fn(), upload: vi.fn() }) },
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    rpc: vi.fn(),
  }),
}));

import { extrairHorariosDieta, normalizarHora, horariosDietaVazio } from '../src/services/rag';

function haikuRetornaJson(obj: Record<string, string | null>) {
  haikuCreateSpy.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(obj) }],
  });
}

beforeEach(() => {
  haikuCreateSpy.mockReset();
});

describe('normalizarHora', () => {
  it('"7h" → "07:00"', () => expect(normalizarHora('7h')).toBe('07:00'));
  it('"7h30" → "07:30"', () => expect(normalizarHora('7h30')).toBe('07:30'));
  it('"7:00" → "07:00"', () => expect(normalizarHora('7:00')).toBe('07:00'));
  it('"7:30" → "07:30"', () => expect(normalizarHora('7:30')).toBe('07:30'));
  it('"07:30" → "07:30"', () => expect(normalizarHora('07:30')).toBe('07:30'));
  it('"12h30" → "12:30"', () => expect(normalizarHora('12h30')).toBe('12:30'));
  it('"07h00" → "07:00"', () => expect(normalizarHora('07h00')).toBe('07:00'));
  it('"7" puro → "07:00"', () => expect(normalizarHora('7')).toBe('07:00'));
  it('null → null', () => expect(normalizarHora(null)).toBeNull());
  it('vazio → null', () => expect(normalizarHora('')).toBeNull());
  it('"25h" fora de range → null', () => expect(normalizarHora('25h')).toBeNull());
  it('"7h99" minuto invalido → null', () => expect(normalizarHora('7h99')).toBeNull());
  it('"abc" lixo → null', () => expect(normalizarHora('abc')).toBeNull());
});

describe('horariosDietaVazio', () => {
  it('retorna 5 chaves todas null', () => {
    expect(horariosDietaVazio()).toEqual({
      cafe: null,
      lanche_manha: null,
      almoco: null,
      lanche_tarde: null,
      jantar: null,
    });
  });
});

describe('extrairHorariosDieta', () => {
  it('PDF com 3 horarios explicitos → 3 chaves preenchidas, 2 null', async () => {
    haikuRetornaJson({
      cafe: '07:00',
      lanche_manha: null,
      almoco: '12:30',
      lanche_tarde: null,
      jantar: '20:00',
    });
    const r = await extrairHorariosDieta('Cafe 7h, almoco 12h30, jantar 20h');
    expect(r).toEqual({
      cafe: '07:00',
      lanche_manha: null,
      almoco: '12:30',
      lanche_tarde: null,
      jantar: '20:00',
    });
  });

  it('PDF com 5 horarios → todas as 5 chaves preenchidas', async () => {
    haikuRetornaJson({
      cafe: '07:00',
      lanche_manha: '10:00',
      almoco: '12:30',
      lanche_tarde: '16:00',
      jantar: '20:00',
    });
    const r = await extrairHorariosDieta('Refeicoes: 7h, 10h, 12h30, 16h, 20h');
    expect(r.cafe).toBe('07:00');
    expect(r.lanche_manha).toBe('10:00');
    expect(r.almoco).toBe('12:30');
    expect(r.lanche_tarde).toBe('16:00');
    expect(r.jantar).toBe('20:00');
  });

  it('PDF sem horarios explicitos → todas null', async () => {
    haikuRetornaJson({
      cafe: null, lanche_manha: null, almoco: null, lanche_tarde: null, jantar: null,
    });
    const r = await extrairHorariosDieta('Almoco proximo do meio-dia, jantar a noite');
    expect(r).toEqual(horariosDietaVazio());
  });

  it('Haiku retorna JSON cercado de ```json → ainda parseia', async () => {
    haikuCreateSpy.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: '```json\n{"cafe":"07:00","lanche_manha":null,"almoco":"12:30","lanche_tarde":null,"jantar":"20:00"}\n```',
      }],
    });
    const r = await extrairHorariosDieta('texto qualquer');
    expect(r.cafe).toBe('07:00');
    expect(r.jantar).toBe('20:00');
  });

  it('Haiku retorna formato "7h" (nao normalizado) → normaliza para "07:00"', async () => {
    haikuRetornaJson({
      cafe: '7h', lanche_manha: null, almoco: '12h30', lanche_tarde: null, jantar: '20h',
    });
    const r = await extrairHorariosDieta('texto');
    expect(r.cafe).toBe('07:00');
    expect(r.almoco).toBe('12:30');
    expect(r.jantar).toBe('20:00');
  });

  it('Haiku retorna JSON quebrado → retorna todos null (fallback seguro)', async () => {
    haikuCreateSpy.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'nao e json valido aqui' }],
    });
    const r = await extrairHorariosDieta('texto');
    expect(r).toEqual(horariosDietaVazio());
  });

  it('Haiku lanca erro → retorna todos null (nao propaga)', async () => {
    haikuCreateSpy.mockRejectedValueOnce(new Error('network'));
    const r = await extrairHorariosDieta('texto');
    expect(r).toEqual(horariosDietaVazio());
  });

  it('Haiku retorna chave invalida (ex: cafe="meio-dia") → cai em null sem quebrar', async () => {
    haikuRetornaJson({
      cafe: 'meio-dia',
      lanche_manha: null,
      almoco: '12:30',
      lanche_tarde: null,
      jantar: null,
    });
    const r = await extrairHorariosDieta('texto');
    expect(r.cafe).toBeNull();
    expect(r.almoco).toBe('12:30');
  });
});
