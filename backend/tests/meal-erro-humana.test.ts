import { describe, it, expect, vi } from 'vitest';

// meal.ts → rag.ts → pdf-parse executa codigo em nivel de import que abre um
// PDF de teste do proprio pacote. Mocks abaixo evitam esse side-effect e
// tambem Supabase/Anthropic/evolution que meal.ts instancia no top-level.

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn(async () => ({ content: [{ type: 'text', text: '{}' }] })) };
  },
}));

vi.mock('../src/services/evolution', () => ({
  sendText: vi.fn(async () => undefined),
}));

vi.mock('../src/services/rag', () => ({
  query: vi.fn(async () => ''),
}));

import { mensagemErroHumana } from '../src/services/meal';

const MSG_SOBRECARGA = '😅 Meu servidor tá cheio agora. Tenta em 1-2 minutos.';
const MSG_GENERICA = '😅 Tá um pouco lento aqui do meu lado agora. Me manda de novo em uns 30s?';

describe('mensagemErroHumana', () => {
  describe('sobrecarga (status 429/529/503)', () => {
    it('429 (rate limit) → msg de sobrecarga', () => {
      expect(mensagemErroHumana({ status: 429 })).toBe(MSG_SOBRECARGA);
    });

    it('529 (Anthropic overloaded) → msg de sobrecarga', () => {
      expect(mensagemErroHumana({ status: 529 })).toBe(MSG_SOBRECARGA);
    });

    it('503 (service unavailable) → msg de sobrecarga', () => {
      expect(mensagemErroHumana({ status: 503 })).toBe(MSG_SOBRECARGA);
    });

    it('status vindo em err.response.status (formato axios) tambem e detectado', () => {
      expect(mensagemErroHumana({ response: { status: 429 } })).toBe(MSG_SOBRECARGA);
      expect(mensagemErroHumana({ response: { status: 529 } })).toBe(MSG_SOBRECARGA);
    });
  });

  describe('sobrecarga (code de rede)', () => {
    it('ETIMEDOUT → msg de sobrecarga', () => {
      expect(mensagemErroHumana({ code: 'ETIMEDOUT' })).toBe(MSG_SOBRECARGA);
    });

    it('ECONNRESET → msg de sobrecarga', () => {
      expect(mensagemErroHumana({ code: 'ECONNRESET' })).toBe(MSG_SOBRECARGA);
    });

    it('ECONNREFUSED → msg de sobrecarga', () => {
      expect(mensagemErroHumana({ code: 'ECONNREFUSED' })).toBe(MSG_SOBRECARGA);
    });
  });

  describe('fallback generico', () => {
    it('400 (bad request) → msg generica curta (30s)', () => {
      expect(mensagemErroHumana({ status: 400 })).toBe(MSG_GENERICA);
    });

    it('500 (server error nao mapeado) → msg generica', () => {
      expect(mensagemErroHumana({ status: 500 })).toBe(MSG_GENERICA);
    });

    it('Error nativo sem status/code → msg generica', () => {
      expect(mensagemErroHumana(new Error('json invalido'))).toBe(MSG_GENERICA);
    });

    it('code nao mapeado (ex: EHOSTUNREACH) → msg generica', () => {
      expect(mensagemErroHumana({ code: 'EHOSTUNREACH' })).toBe(MSG_GENERICA);
    });

    it('objeto vazio → msg generica sem crashar', () => {
      expect(mensagemErroHumana({})).toBe(MSG_GENERICA);
    });

    it('null → msg generica sem crashar', () => {
      expect(mensagemErroHumana(null)).toBe(MSG_GENERICA);
    });

    it('undefined → msg generica sem crashar', () => {
      expect(mensagemErroHumana(undefined)).toBe(MSG_GENERICA);
    });

    it('string → msg generica (nao interpretado como erro estruturado)', () => {
      expect(mensagemErroHumana('erro qualquer')).toBe(MSG_GENERICA);
    });
  });
});
