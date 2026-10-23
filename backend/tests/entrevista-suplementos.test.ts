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

// Agentes de teste 2026-10-23 (onboarding Juliana): "café 7h, almoço 12h, lanche 16h,
// jantar 20h" gravava só 3 horários — "lanche" sem "manhã"/"tarde" era descartado, e o
// lembrete do lanche nunca seria enviado.
import { parseHorariosRefeicoes } from '../src/services/agent';

describe('parseHorariosRefeicoes — lanche sem período', () => {
  it('"lanche 16h" vira lanche da tarde', () => {
    expect(parseHorariosRefeicoes('café 7h, almoço 12h, lanche 16h, jantar 20h')).toEqual({
      cafe: '07:00',
      almoco: '12:00',
      lanche_tarde: '16:00',
      jantar: '20:00',
    });
  });

  it('"lanche 10h" vira lanche da manhã', () => {
    expect(parseHorariosRefeicoes('cafe 7h lanche 10h almoço 13h janta 20h')).toMatchObject({ lanche_manha: '10:00' });
  });

  it('dois lanches sem período: um de manhã, outro à tarde', () => {
    expect(parseHorariosRefeicoes('café 7h, lanche 10h, almoço 12h30, lanche 16h, jantar 20h')).toEqual({
      cafe: '07:00',
      lanche_manha: '10:00',
      almoco: '12:30',
      lanche_tarde: '16:00',
      jantar: '20:00',
    });
  });

  it('"lanche da tarde 16h" continua igual', () => {
    expect(parseHorariosRefeicoes('café 7h, almoço 12h, lanche da tarde 16h, jantar 20h')).toMatchObject({ lanche_tarde: '16:00' });
  });
});

// Agentes de teste 2026-10-23 (onboarding Juliana): ela respondeu "musculação 3x na
// semana" na etapa 6 e o bot perguntou a frequência de novo na etapa 7. Sedentário
// também ouvia "com que frequência você treina?" e "em que horário você treina?".
import { extrairFrequenciaTreino, proximaEtapaEntrevista } from '../src/services/agent';

describe('extrairFrequenciaTreino', () => {
  it.each([
    ['musculação 3x na semana', '3x por semana'],
    ['faço academia 5 vezes por semana', '5x por semana'],
    ['corro todo dia', 'todo dia'],
  ])('"%s" → %s', (texto, esperado) => {
    expect(extrairFrequenciaTreino(texto)).toBe(esperado);
  });

  it('sem frequência na frase → null', () => {
    expect(extrairFrequenciaTreino('musculação')).toBeNull();
    expect(extrairFrequenciaTreino('1')).toBeNull();
  });
});

describe('proximaEtapaEntrevista — pula o que já foi respondido', () => {
  it('frequência já informada pula a etapa 7', () => {
    expect(proximaEtapaEntrevista(6, { atividade_frequencia: '3x por semana' })).toBe(8);
  });
  it('sedentário pula 7 e 8', () => {
    expect(proximaEtapaEntrevista(6, { atividade_frequencia: 'não treino', atividade_horario: 'não treino' })).toBe(9);
  });
  it('sem dado extra segue a ordem normal', () => {
    expect(proximaEtapaEntrevista(6, {})).toBe(7);
    expect(proximaEtapaEntrevista(9, {})).toBe(10);
  });
});
