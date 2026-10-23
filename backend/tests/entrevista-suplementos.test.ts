import { describe, it, expect, vi } from 'vitest';

// Agentes de teste 2026-10-23 (cenário 02b): "não uso nenhum suplemento não só tomo mesmo
// os remédios que o médico passou" era gravado como LISTA de suplementos — só "não uso"
// exato virava lista vazia. Remédio prescrito não é suplemento.

vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() }; } }));
vi.mock('@langchain/openai', () => ({ OpenAIEmbeddings: class {} }));
vi.mock('../src/services/rag', () => ({ ragQuery: vi.fn(async () => ''), obterHorariosDieta: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }));
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));

import { parseSuplementos } from '../src/services/agent';

describe('parseSuplementos (etapa 13 da entrevista)', () => {
  it.each([
    'não uso',
    'nao uso',
    'nenhum',
    'não uso nenhum suplemento não só tomo mesmo os remédios que o médico passou',
    'não, nada. só os remédios da pressão',
    'nenhum suplemento, só metformina e losartana',
  ])('"%s" → nenhum suplemento', (texto) => {
    expect(parseSuplementos(texto)).toEqual([]);
  });

  it('negativa com suplemento conhecido mantém só o suplemento', () => {
    expect(parseSuplementos('não, só creatina')).toEqual(['creatina']);
  });

  it('lista normal continua igual', () => {
    expect(parseSuplementos('creatina e whey')).toEqual(['creatina', 'whey']);
    expect(parseSuplementos('whey, ômega 3')).toEqual(['whey', 'ômega 3']);
  });

  it('negativa com substância controlada mantém a substância (o aviso de segurança depende disso)', () => {
    expect(parseSuplementos('não uso suplemento, só oxandrolona')).toEqual(['oxandrolona']);
  });
});
