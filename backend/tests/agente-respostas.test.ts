import { describe, it, expect, vi } from 'vitest';

// Agentes de teste 2026-10-23:
// - 03a: resposta de água não mostrava o total do dia ("500ml registrados!"), então o
//   paciente não tinha como perceber se "hoje foram 3 copos" somou ou virou o total.
// - 03d: sem trecho do PDF, o prompt dizia ao modelo que "a dieta JÁ ESTÁ processada"
//   mesmo pra paciente SEM dieta — o bot fingia conhecer um plano inexistente.

vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() }; } }));
vi.mock('@langchain/openai', () => ({ OpenAIEmbeddings: class {} }));
vi.mock('../src/services/rag', () => ({ ragQuery: vi.fn(async () => ''), obterHorariosDieta: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }));
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));

import { mensagemAguaRegistrada, textoContextoDieta } from '../src/services/agent';

describe('mensagemAguaRegistrada', () => {
  it('mostra o que entrou e o total do dia contra a meta', () => {
    const m = mensagemAguaRegistrada(750, 1250, 2520);
    expect(m).toContain('750ml');
    expect(m).toMatch(/1\.250\s*ml/);
    expect(m).toMatch(/2\.520\s*ml/);
  });

  it('sem meta cadastrada mostra só o total', () => {
    const m = mensagemAguaRegistrada(500, 500, undefined);
    expect(m).toMatch(/500\s*ml/);
    expect(m).not.toMatch(/undefined|NaN/);
  });
});

describe('textoContextoDieta', () => {
  it('com trechos do PDF, usa os trechos', () => {
    expect(textoContextoDieta('Café: 2 ovos', true)).toBe('Café: 2 ovos');
  });

  it('SEM dieta cadastrada, não afirma que existe plano', () => {
    const t = textoContextoDieta('', false);
    expect(t).not.toMatch(/J[ÁA] EST[ÁA] processada/i);
    expect(t).toMatch(/ainda n[ãa]o tem dieta/i);
  });

  it('com dieta mas sem trecho relevante, mantém a orientação de reformular', () => {
    expect(textoContextoDieta('', true)).toMatch(/reformul/i);
  });
});
