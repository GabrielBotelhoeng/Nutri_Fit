import { describe, it, expect, vi, beforeEach } from 'vitest';

// agent.ts instancia o Anthropic no top-level — mock antes de importar.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

// rag.ts tambem instancia OpenAIEmbeddings + Anthropic no top-level. Mock pra
// nao bater na rede e expor um spy controlavel pra buscarHorariosDietaPaciente.
vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: class {
    async embedDocuments() { return []; }
    async embedQuery() { return []; }
  },
}));

const { buscarHorariosDietaPacienteSpy } = vi.hoisted(() => ({
  buscarHorariosDietaPacienteSpy: vi.fn(),
}));

vi.mock('../src/services/rag', () => ({
  buscarHorariosDietaPaciente: buscarHorariosDietaPacienteSpy,
  // Stubs para os outros exports usados pelo agent.ts — agent.ts so chama
  // `query` no caminho de consulta RAG (apos entrevista completa), nunca na
  // logica da etapa 14, mas precisa existir pro import resolver.
  query: vi.fn(),
}));

// supabase tambem aparece no top-level do agent.ts (registrarAguaContador).
// Mock minimo: agent.ts so usa createClient(...).rpc(...) que retorna {error:null}.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

import {
  prepararPerguntaEtapa14,
  tratarRespostaConfirmacaoHorarios,
} from '../src/services/agent';
import type { EstadoEntrevista } from '../src/services/conversation';

beforeEach(() => {
  buscarHorariosDietaPacienteSpy.mockReset();
});

function dadosBase(): EstadoEntrevista['dados'] {
  return {};
}

describe('prepararPerguntaEtapa14', () => {
  it('PDF sem horarios → cai na pergunta aberta original', async () => {
    buscarHorariosDietaPacienteSpy.mockResolvedValueOnce(null);
    const r = await prepararPerguntaEtapa14('paciente-1');
    expect(r.mensagem).toContain('Em quais horarios voce costuma');
    expect(r.dadosExtras).toEqual({});
  });

  it('PDF com todos 5 horarios → mensagem de confirmacao + flag completa', async () => {
    buscarHorariosDietaPacienteSpy.mockResolvedValueOnce({
      cafe: '07:00',
      lanche_manha: '10:00',
      almoco: '12:30',
      lanche_tarde: '16:00',
      jantar: '20:00',
    });
    const r = await prepararPerguntaEtapa14('paciente-2');
    expect(r.mensagem).toContain('Vi na sua dieta');
    expect(r.mensagem).toContain('7h');
    expect(r.mensagem).toContain('10h');
    expect(r.mensagem).toContain('12h30');
    expect(r.mensagem).toContain('16h');
    expect(r.mensagem).toContain('20h');
    expect(r.mensagem).toContain('Confere?');
    expect(r.dadosExtras.confirmacao_horarios_pendente).toBe('completa');
    expect(r.dadosExtras.horarios_pre_extraidos).toEqual({
      cafe: '07:00',
      lanche_manha: '10:00',
      almoco: '12:30',
      lanche_tarde: '16:00',
      jantar: '20:00',
    });
  });

  it('PDF com 3 horarios (cafe, almoco, jantar) → mensagem parcial pedindo lanches', async () => {
    buscarHorariosDietaPacienteSpy.mockResolvedValueOnce({
      cafe: '07:00',
      lanche_manha: null,
      almoco: '12:30',
      lanche_tarde: null,
      jantar: '20:00',
    });
    const r = await prepararPerguntaEtapa14('paciente-3');
    expect(r.mensagem).toContain('Vi na sua dieta');
    expect(r.mensagem).toContain('Lanche da manha');
    expect(r.mensagem).toContain('Lanche da tarde');
    // jantar NAO deve aparecer como faltante — esta preenchido no PDF
    expect(r.mensagem).not.toContain('Jantar*');
    expect(r.dadosExtras.confirmacao_horarios_pendente).toBe('parcial');
    expect(r.dadosExtras.horarios_pre_extraidos).toEqual({
      cafe: '07:00',
      almoco: '12:30',
      jantar: '20:00',
    });
  });

  it('PDF com 1 horario apenas (cafe) → parcial pedindo os outros 4', async () => {
    buscarHorariosDietaPacienteSpy.mockResolvedValueOnce({
      cafe: '07:00',
      lanche_manha: null,
      almoco: null,
      lanche_tarde: null,
      jantar: null,
    });
    const r = await prepararPerguntaEtapa14('paciente-4');
    expect(r.mensagem).toContain('Vi na sua dieta');
    expect(r.dadosExtras.confirmacao_horarios_pendente).toBe('parcial');
    expect(r.dadosExtras.horarios_pre_extraidos).toEqual({ cafe: '07:00' });
  });

  it('formatacao da hora: "07:30" vira "7h30" no texto', async () => {
    buscarHorariosDietaPacienteSpy.mockResolvedValueOnce({
      cafe: '07:30',
      lanche_manha: null,
      almoco: '12:30',
      lanche_tarde: null,
      jantar: '19:45',
    });
    const r = await prepararPerguntaEtapa14('paciente-5');
    expect(r.mensagem).toMatch(/7h30/);
    expect(r.mensagem).toMatch(/12h30/);
    expect(r.mensagem).toMatch(/19h45/);
  });
});

describe('tratarRespostaConfirmacaoHorarios — flag completa', () => {
  function dadosCompleta(): EstadoEntrevista['dados'] {
    return {
      confirmacao_horarios_pendente: 'completa',
      horarios_pre_extraidos: {
        cafe: '07:00',
        lanche_manha: '10:00',
        almoco: '12:30',
        lanche_tarde: '16:00',
        jantar: '20:00',
      },
    };
  }

  it('sem flag pendente → handled=false (cai no parser tradicional)', () => {
    const r = tratarRespostaConfirmacaoHorarios('sim', dadosBase());
    expect(r.handled).toBe(false);
  });

  it('flag pendente sem horarios_pre_extraidos → handled=false', () => {
    const r = tratarRespostaConfirmacaoHorarios('sim', {
      confirmacao_horarios_pendente: 'completa',
    } as EstadoEntrevista['dados']);
    expect(r.handled).toBe(false);
  });

  it('"sim" → grava horarios_refeicoes do PDF e limpa flags', () => {
    const r = tratarRespostaConfirmacaoHorarios('sim', dadosCompleta());
    expect(r.handled).toBe(true);
    expect(r.mensagemRepetir).toBeUndefined();
    expect(r.novoDado).toMatchObject({
      horarios_refeicoes: {
        cafe: '07:00',
        lanche_manha: '10:00',
        almoco: '12:30',
        lanche_tarde: '16:00',
        jantar: '20:00',
      },
      confirmacao_horarios_pendente: null,
      horarios_pre_extraidos: null,
    });
  });

  it('"s" (atalho) → trata como sim', () => {
    const r = tratarRespostaConfirmacaoHorarios('s', dadosCompleta());
    expect(r.handled).toBe(true);
    expect(r.novoDado?.horarios_refeicoes).toBeDefined();
  });

  it('"Sim, confere!" → trata como sim (case-insensitive)', () => {
    const r = tratarRespostaConfirmacaoHorarios('Sim, confere!', dadosCompleta());
    expect(r.handled).toBe(true);
    expect(r.novoDado?.horarios_refeicoes).toBeDefined();
  });

  it('"nao" → repete pergunta aberta e limpa flags', () => {
    const r = tratarRespostaConfirmacaoHorarios('nao', dadosCompleta());
    expect(r.handled).toBe(true);
    expect(r.mensagemRepetir).toContain('Em quais horarios');
    expect(r.novoDado).toMatchObject({
      confirmacao_horarios_pendente: null,
      horarios_pre_extraidos: null,
    });
    expect(r.novoDado?.horarios_refeicoes).toBeUndefined();
  });

  it('"nao confere" → cai na pergunta aberta', () => {
    const r = tratarRespostaConfirmacaoHorarios('nao confere', dadosCompleta());
    expect(r.handled).toBe(true);
    expect(r.mensagemRepetir).toContain('Em quais horarios');
  });

  it('"talvez" (nem sim nem nao) → pede sim/nao explicito sem mudar estado', () => {
    const r = tratarRespostaConfirmacaoHorarios('talvez', dadosCompleta());
    expect(r.handled).toBe(true);
    expect(r.mensagemRepetir).toMatch(/sim.*nao|nao.*sim/i);
    expect(r.novoDado).toBeUndefined();
  });
});

describe('tratarRespostaConfirmacaoHorarios — flag parcial', () => {
  function dadosParcial(): EstadoEntrevista['dados'] {
    return {
      confirmacao_horarios_pendente: 'parcial',
      horarios_pre_extraidos: {
        cafe: '07:00',
        almoco: '12:30',
        jantar: '20:00',
      },
    };
  }

  it('paciente envia 2 horarios → mescla com pre-extraidos', () => {
    const r = tratarRespostaConfirmacaoHorarios('10h e 16h', dadosParcial());
    expect(r.handled).toBe(true);
    expect(r.mensagemRepetir).toBeUndefined();
    expect(r.novoDado?.horarios_refeicoes).toEqual({
      cafe: '07:00',
      almoco: '12:30',
      jantar: '20:00',
      lanche_manha: '10:00',
      lanche_tarde: '16:00',
    });
    expect(r.novoDado?.confirmacao_horarios_pendente).toBeNull();
    expect(r.novoDado?.horarios_pre_extraidos).toBeNull();
  });

  it('paciente envia 1 horario rotulado → mescla so o novo', () => {
    const r = tratarRespostaConfirmacaoHorarios(
      'lanche da manha 10h',
      {
        confirmacao_horarios_pendente: 'parcial',
        horarios_pre_extraidos: {
          cafe: '07:00',
          almoco: '12:30',
          jantar: '20:00',
          lanche_tarde: '16:00',
        },
      } as EstadoEntrevista['dados'],
    );
    expect(r.handled).toBe(true);
    expect(r.novoDado?.horarios_refeicoes).toMatchObject({
      cafe: '07:00',
      almoco: '12:30',
      jantar: '20:00',
      lanche_tarde: '16:00',
      lanche_manha: '10:00',
    });
  });

  it('paciente envia texto sem horario → pede formato', () => {
    const r = tratarRespostaConfirmacaoHorarios('nao sei', dadosParcial());
    expect(r.handled).toBe(true);
    expect(r.mensagemRepetir).toContain('10h');
    expect(r.novoDado).toBeUndefined();
  });

  it('paciente sobrescreve um horario do PDF → respeita o novo (spread mescla)', () => {
    // pre tem cafe=07:00, paciente diz "cafe 08:00" → resultado cafe=08:00
    const r = tratarRespostaConfirmacaoHorarios(
      'cafe 8h, lanche da manha 10h, lanche da tarde 16h',
      dadosParcial(),
    );
    expect(r.handled).toBe(true);
    expect(r.novoDado?.horarios_refeicoes).toMatchObject({
      cafe: '08:00',
      almoco: '12:30',
      jantar: '20:00',
      lanche_manha: '10:00',
      lanche_tarde: '16:00',
    });
  });
});

describe('tratarRespostaConfirmacaoHorarios — flag desconhecida', () => {
  it('flag string nao reconhecida → handled=false (defensivo)', () => {
    const r = tratarRespostaConfirmacaoHorarios('sim', {
      confirmacao_horarios_pendente: 'qualquer_coisa',
      horarios_pre_extraidos: { cafe: '07:00' },
    } as EstadoEntrevista['dados']);
    expect(r.handled).toBe(false);
  });
});
