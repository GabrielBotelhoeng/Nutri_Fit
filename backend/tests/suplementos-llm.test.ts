import { describe, it, expect, vi, beforeEach } from 'vitest';

// suplementos-llm.ts instancia o Anthropic no top-level — mock antes do import.
// claudeState.mode define como o mock responde: 'text' devolve JSON controlado,
// 'throw' lanca erro (simula 429/timeout/parse invalido persistente apos backoff).
const { claudeState, createSpy } = vi.hoisted(() => {
  const state = { mode: 'text' as 'text' | 'throw', text: '{}' };
  const spy = vi.fn(async () => {
    if (state.mode === 'throw') throw new Error('boom');
    return { content: [{ type: 'text', text: state.text }] };
  });
  return { claudeState: state, createSpy: spy };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createSpy };
  },
}));

import {
  sugerirDoseSuplementosLLM,
  formatarMensagemSuplementosLLM,
  type BlocoSuplemento,
} from '../src/services/suplementos-llm';
import { CONTROLADOS } from '../src/services/suplementos';

const CONTROLADOS_SET = new Set(Object.keys(CONTROLADOS));
const CTX = { peso_kg: 80, sexo: 'masculino', objetivo: 'hipertrofia' };

beforeEach(() => {
  claudeState.mode = 'text';
  claudeState.text = '{}';
  createSpy.mockClear();
});

describe('sugerirDoseSuplementosLLM — short-circuit e falhas', () => {
  it('lista vazia (seguros + desconhecidos) → nao chama Claude, retorna vazio', async () => {
    const r = await sugerirDoseSuplementosLLM(CTX, [], [], CONTROLADOS_SET);
    expect(r).toEqual({ blocos: [], falhou: false });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('LLM lanca erro apos retries → falhou: true, blocos vazio', async () => {
    claudeState.mode = 'throw';
    const r = await sugerirDoseSuplementosLLM(CTX, ['BCAA'], [], CONTROLADOS_SET);
    expect(r.falhou).toBe(true);
    expect(r.blocos).toEqual([]);
  });

  it('JSON invalido → falhou: true', async () => {
    claudeState.text = 'nao sou json { { ]';
    const r = await sugerirDoseSuplementosLLM(CTX, ['BCAA'], [], CONTROLADOS_SET);
    expect(r.falhou).toBe(true);
    expect(r.blocos).toEqual([]);
  });

  it('JSON valido mas sem campo "itens" → falhou: true', async () => {
    claudeState.text = JSON.stringify({ outra_chave: [] });
    const r = await sugerirDoseSuplementosLLM(CTX, ['BCAA'], [], CONTROLADOS_SET);
    expect(r.falhou).toBe(true);
  });

  it('resposta com markdown fence → parseia normalmente', async () => {
    claudeState.text =
      '```json\n' +
      JSON.stringify({
        itens: [
          { nome: 'BCAA', categoria: 'aminoacido', dose: '10g/dia', timing: 'pre-treino', cautela: null },
        ],
      }) +
      '\n```';
    const r = await sugerirDoseSuplementosLLM(CTX, ['BCAA'], [], CONTROLADOS_SET);
    expect(r.falhou).toBe(false);
    expect(r.blocos).toHaveLength(1);
    expect(r.blocos[0].dose).toBe('10g/dia');
  });
});

describe('sugerirDoseSuplementosLLM — categorias com dose (whitelist)', () => {
  it('BCAA (aminoacido) → mantem dose, precisa_nutri=false', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        {
          nome: 'BCAA',
          categoria: 'aminoacido',
          dose: '10-20g/dia',
          timing: 'intra-treino',
          cautela: 'ineficaz se dieta ja tem 1.6g proteina/kg',
        },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, ['BCAA'], [], CONTROLADOS_SET);
    expect(r.blocos).toHaveLength(1);
    expect(r.blocos[0].precisa_nutri).toBe(false);
    expect(r.blocos[0].dose).toBe('10-20g/dia');
    expect(r.blocos[0].timing).toBe('intra-treino');
  });

  it('adaptogeno (ashwagandha) → mantem dose', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        {
          nome: 'Ashwagandha',
          categoria: 'adaptogeno',
          dose: '300-600 mg/dia',
          timing: 'noite',
          cautela: 'evitar em gestantes',
        },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, ['ashwagandha'], [], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(false);
    expect(r.blocos[0].dose).toMatch(/300-600/);
  });

  it('categoria fora da whitelist ("misc") → forca precisa_nutri, apaga dose', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        { nome: 'produtoX', categoria: 'misc', dose: '5g', timing: 'manha', cautela: null },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, ['produtoX'], [], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
    expect(r.blocos[0].timing).toBeNull();
    expect(r.blocos[0].cautela).toMatch(/valide com/i);
  });
});

describe('sugerirDoseSuplementosLLM — categorias sem dose (blacklist)', () => {
  it('peptideo (BPC-157) → precisa_nutri, dose=null', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        { nome: 'BPC-157', categoria: 'peptideo', dose: null, timing: null, cautela: 'peptideo sem aprovacao clinica' },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, [], ['BPC-157'], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
    expect(r.blocos[0].cautela).toMatch(/peptideo|valide/i);
  });

  it('categoria "desconhecido" (manipulado por nome comercial) → precisa_nutri sem dose', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        {
          nome: 'Formula X do farmaceutico',
          categoria: 'desconhecido',
          dose: null,
          timing: null,
          cautela: 'me manda os ingredientes que eu explico cada um',
        },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, [], ['formula-x'], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
    expect(r.blocos[0].cautela).toMatch(/ingredientes/i);
  });

  it('categoria "hormonio" → forca sem dose mesmo se LLM tiver sugerido', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        { nome: 'testX', categoria: 'hormonio', dose: '250mg/semana', timing: null, cautela: null },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, [], ['testX'], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
  });
});

describe('sugerirDoseSuplementosLLM — cross-check controlados e termos suspeitos', () => {
  it('LLM devolve nome de controlado (clembuterol) com categoria "outro_suplemento_alimentar" → forca precisa_nutri', async () => {
    // Simula LLM burlado: categoria whitelist mas nome bate com CONTROLADOS.
    claudeState.text = JSON.stringify({
      itens: [
        {
          nome: 'clembuterol',
          categoria: 'outro_suplemento_alimentar',
          dose: '40mcg 2x/dia',
          timing: 'manha',
          cautela: null,
        },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, [], ['clembuterol'], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
  });

  it('nome com stanozolol embedded (case + acentos) → cross-check pega', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        {
          nome: 'stanozolol pura',
          categoria: 'proteina',
          dose: '20mg/dia',
          timing: null,
          cautela: null,
        },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, [], ['sta'], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
  });

  it('termo suspeito "ciclo de" na cautela → descarta dose', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        {
          nome: 'algo',
          categoria: 'aminoacido',
          dose: '10g/dia',
          timing: null,
          cautela: 'faca um ciclo de 8 semanas',
        },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, ['algo'], [], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
  });

  it('termo suspeito "ml/semana" no timing → descarta dose', async () => {
    // Espaco antes de "ml" pra bater com \bml/semana\b (word boundary do regex).
    claudeState.text = JSON.stringify({
      itens: [
        {
          nome: 'algo',
          categoria: 'proteina',
          dose: '30g',
          timing: 'aplicar 2 ml/semana',
          cautela: null,
        },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, ['algo'], [], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
  });

  it('termo suspeito "PCT" na dose → descarta dose', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        { nome: 'algo', categoria: 'aminoacido', dose: 'PCT 4 semanas', timing: null, cautela: null },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, ['algo'], [], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
  });
});

describe('sugerirDoseSuplementosLLM — sanitizacao de entrada', () => {
  it('item sem nome → descartado silenciosamente', async () => {
    claudeState.text = JSON.stringify({
      itens: [
        { categoria: 'aminoacido', dose: '10g' },
        { nome: 'BCAA', categoria: 'aminoacido', dose: '10g', timing: null, cautela: null },
      ],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, ['BCAA'], [], CONTROLADOS_SET);
    expect(r.blocos).toHaveLength(1);
    expect(r.blocos[0].nome).toBe('BCAA');
  });

  it('categoria ausente → tratada como "desconhecido" → precisa_nutri', async () => {
    claudeState.text = JSON.stringify({
      itens: [{ nome: 'algo', dose: '10g' }],
    });
    const r = await sugerirDoseSuplementosLLM(CTX, [], ['algo'], CONTROLADOS_SET);
    expect(r.blocos[0].precisa_nutri).toBe(true);
    expect(r.blocos[0].dose).toBeNull();
  });
});

describe('formatarMensagemSuplementosLLM', () => {
  it('lista vazia → string vazia', () => {
    expect(formatarMensagemSuplementosLLM([])).toBe('');
  });

  it('bloco doseado → inclui dose, timing e cautela', () => {
    const bloco: BlocoSuplemento = {
      nome: 'BCAA',
      categoria: 'aminoacido',
      dose: '10-20g/dia',
      timing: 'intra-treino',
      cautela: 'ineficaz se ja atinge proteina/dia',
      precisa_nutri: false,
    };
    const msg = formatarMensagemSuplementosLLM([bloco]);
    expect(msg).toMatch(/BCAA/);
    expect(msg).toMatch(/Dose sugerida:.*10-20g/);
    expect(msg).toMatch(/Quando:.*intra-treino/);
    expect(msg).toMatch(/Cuidado:.*ineficaz/);
    expect(msg).not.toMatch(/Nao vou sugerir dose/i);
  });

  it('bloco precisa_nutri sem dose → linha "nao vou sugerir dose"', () => {
    const bloco: BlocoSuplemento = {
      nome: 'BPC-157',
      categoria: 'peptideo',
      dose: null,
      timing: null,
      cautela: 'peptideo sem aprovacao',
      precisa_nutri: true,
    };
    const msg = formatarMensagemSuplementosLLM([bloco]);
    expect(msg).toMatch(/BPC-157/);
    // Acento no output real ("Não vou sugerir dose") — regex tolera com/sem.
    expect(msg).toMatch(/n[aã]o vou sugerir dose/i);
    expect(msg).toMatch(/nutri.*m[eé]dico/i);
  });

  it('mensagem sempre termina com o disclaimer de sugestao inicial', () => {
    const bloco: BlocoSuplemento = {
      nome: 'Whey',
      categoria: 'proteina',
      dose: '24g',
      timing: 'pos-treino',
      cautela: null,
      precisa_nutri: false,
    };
    const msg = formatarMensagemSuplementosLLM([bloco]);
    expect(msg).toMatch(/Sugestoes iniciais|nutricionista pode ajustar/i);
  });
});
