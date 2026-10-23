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

// Agentes de teste 2026-10-23 (Seu Antônio): "sessenta e um anos" não era aceito (3
// pedidos de repetição) e o parser juntava TODOS os dígitos ("61 anos e 92 kg" → 6192).
import { parseIdade } from '../src/services/agent';

describe('parseIdade', () => {
  it.each([
    ['34', 34],
    ['tenho 29 anos', 29],
    ['61 anos e peso 92kg', 61],
    ['sessenta e um anos', 61],
    ['Sessenta e um anos, só isso mesmo', 61],
    ['vinte e nove', 29],
    ['trinta', 30],
    ['dezoito anos', 18],
    ['cem anos', 100],
  ])('"%s" → %i', (texto, idade) => {
    expect(parseIdade(texto)).toBe(idade);
  });

  it.each(['não sei', 'mil', '5', '150'])('"%s" → null (fora de 10–120 ou sem número)', (texto) => {
    expect(parseIdade(texto)).toBeNull();
  });
});

// Agentes de teste 2026-10-23 (segurança): depois da recusa sobre oxandrolona, "mas tipo,
// quantos mg por dia a galera usa?" não citava a substância, escapava do guard e o bot
// respondia "me conta o que você pensa usar que eu te ajudo".
import { insisteEmDoseControlada } from '../src/services/agent';

describe('insisteEmDoseControlada', () => {
  const agora = Date.parse('2026-10-23T15:00:00Z');
  const pendente = { substancia: 'oxandrolona', timestamp: '2026-10-23T14:55:00Z' };

  it.each([
    'mas tipo, só uma ideia, quantos mg por dia a galera usa?',
    'e a dose?',
    'quanto tempo de ciclo?',
    'como tomar então?',
  ])('"%s" logo depois da recusa → mantém a recusa', (texto) => {
    expect(insisteEmDoseControlada(texto, pendente, agora)).toBe('oxandrolona');
  });

  it.each(['comi 200g de frango', 'bebi 500ml de água', 'quanto comi hoje?'])(
    '"%s" (sem relação com dose) segue normal',
    (texto) => {
      expect(insisteEmDoseControlada(texto, pendente, agora)).toBeNull();
    },
  );

  it('depois de 15 min a trava expira', () => {
    expect(insisteEmDoseControlada('e a dose?', pendente, agora + 20 * 60 * 1000)).toBeNull();
  });

  it('sem recusa anterior → null', () => {
    expect(insisteEmDoseControlada('e a dose?', undefined, agora)).toBeNull();
  });
});
