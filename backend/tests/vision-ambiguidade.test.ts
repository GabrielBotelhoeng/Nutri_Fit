import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fase C — ambiguidade de foto: valida handleAmbiguidade + resolverAmbiguidadeFoto.
// Mockamos meal/evolution/conversation pra isolar a logica de:
//  - Decidir pergunta ("mais alguem" vs "uma so ou separadas")
//  - Divisao de macros por N pessoas
//  - Split em N registros quando 'separadas'
//  - Fallback quando refeicoes[] vazio mas paciente pediu separadas
//  - Repergunta em resposta invalida (retorna false)

const {
  sendTextSpy,
  atualizarEstadoSpy,
  registrarRefeicaoSpy,
  obterSaldoDiaSpy,
  calcularStreakSpy,
  dispararAlertaOvershootSpy,
  formatarBlocoProgressoDiaSpy,
  formatarSaldoDiaSpy,
  estadoState,
} = vi.hoisted(() => ({
  sendTextSpy: vi.fn(async () => undefined),
  atualizarEstadoSpy: vi.fn(async () => undefined),
  registrarRefeicaoSpy: vi.fn(async () => ({ id: 'ref-x', registrado_em: new Date().toISOString() })),
  obterSaldoDiaSpy: vi.fn(async () => ({ kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 })),
  calcularStreakSpy: vi.fn(async () => ({ proteina: 0, kcal: 0, batendo_hoje_proteina: false, batendo_hoje_kcal: false })),
  dispararAlertaOvershootSpy: vi.fn(async () => undefined),
  formatarBlocoProgressoDiaSpy: vi.fn(() => '📊 bloco progresso'),
  formatarSaldoDiaSpy: vi.fn(() => '📊 saldo'),
  estadoState: {
    dados: {
      metas_kcal: 2000,
      metas_proteina_g: 150,
      metas_carbo_g: 250,
      metas_gordura_g: 60,
    } as Record<string, unknown>,
  },
}));

// Anthropic instanciado no top-level de vision.ts — precisa mock mesmo que
// nao usemos os helpers testados aqui.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn(async () => ({ content: [{ type: 'text', text: '{}' }] })) };
  },
}));

vi.mock('../src/services/evolution', () => ({
  sendText: sendTextSpy,
}));

vi.mock('../src/services/conversation', () => ({
  getEstado: vi.fn(async () => ({ dados: estadoState.dados })),
  atualizarEstado: atualizarEstadoSpy,
  buscarPacientePorWhatsapp: vi.fn(async () => ({ id: 'pac-1', nome: 'Gabi' })),
}));

vi.mock('../src/services/meal', () => ({
  registrarRefeicao: registrarRefeicaoSpy,
  obterSaldoDia: obterSaldoDiaSpy,
  calcularStreak: calcularStreakSpy,
  dispararAlertaOvershoot: dispararAlertaOvershootSpy,
  formatarBlocoProgressoDia: formatarBlocoProgressoDiaSpy,
  formatarSaldoDia: formatarSaldoDiaSpy,
  // MacrosRefeicao e apenas type — nao precisa runtime
}));

vi.mock('../src/services/audio', () => ({
  downloadMedia: vi.fn(async () => ({ buffer: Buffer.from('x'), mimetype: 'image/jpeg' })),
}));

vi.mock('../src/services/barcode', () => ({
  processarCodigoBarras: vi.fn(async () => null),
}));

// Importar DEPOIS dos mocks
import {
  handleAmbiguidade,
  resolverAmbiguidadeFoto,
  normalizarDescricoesIndividuais,
  AnalisePrato,
} from '../src/services/vision';
import type { PacienteInfo } from '../src/services/conversation';

const paciente = { id: 'pac-1', nome: 'Gabi' } as PacienteInfo;

function analiseBase(overrides: Partial<AnalisePrato> = {}): AnalisePrato {
  return {
    alimentos: ['arroz 100g', 'frango 150g'],
    confianca: 'alta',
    macros: { kcal: 800, proteina_g: 60, carbo_g: 90, gordura_g: 20 },
    aviso: null,
    ambiguidade: 'nenhuma',
    ...overrides,
  };
}

// Helper — encontra o payload passado a atualizarEstado que tem uma chave especifica.
function ultimoEstadoCom(chave: string): Record<string, unknown> | undefined {
  for (let i = atualizarEstadoSpy.mock.calls.length - 1; i >= 0; i--) {
    const call = atualizarEstadoSpy.mock.calls[i] as unknown as [string, { dados: Record<string, unknown> }];
    if (call[1].dados && chave in call[1].dados) return call[1].dados;
  }
  return undefined;
}

beforeEach(() => {
  sendTextSpy.mockClear();
  atualizarEstadoSpy.mockClear();
  registrarRefeicaoSpy.mockClear();
  obterSaldoDiaSpy.mockClear();
  calcularStreakSpy.mockClear();
  dispararAlertaOvershootSpy.mockClear();
  formatarBlocoProgressoDiaSpy.mockClear();
});

// ------------------------------------------------------------------------
// handleAmbiguidade — envia a pergunta certa e salva estado
// ------------------------------------------------------------------------

describe('handleAmbiguidade', () => {
  it('multiplos_pratos_parecidos → salva tipo=pessoas e pergunta "mais alguém"', async () => {
    const analise = analiseBase({ ambiguidade: 'multiplos_pratos_parecidos' });

    await handleAmbiguidade('5562999999999', paciente, analise);

    const dados = ultimoEstadoCom('foto_ambigua_pendente');
    expect(dados).toBeDefined();
    const pendente = dados!['foto_ambigua_pendente'] as { tipo: string; analise: AnalisePrato };
    expect(pendente.tipo).toBe('pessoas');
    expect(pendente.analise.macros.kcal).toBe(800);
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toMatch(/mais alguém/i);
  });

  it('refeicoes_distintas → salva tipo=refeicoes e pergunta "uma só ou separadas"', async () => {
    const analise = analiseBase({
      ambiguidade: 'refeicoes_distintas',
      refeicoes: [
        { alimentos: ['arroz', 'feijão'], macros: { kcal: 400, proteina_g: 15, carbo_g: 60, gordura_g: 8 } },
        { alimentos: ['panqueca'], macros: { kcal: 400, proteina_g: 10, carbo_g: 55, gordura_g: 12 } },
      ],
    });

    await handleAmbiguidade('5562999999999', paciente, analise);

    const dados = ultimoEstadoCom('foto_ambigua_pendente');
    const pendente = dados!['foto_ambigua_pendente'] as { tipo: string; analise: AnalisePrato };
    expect(pendente.tipo).toBe('refeicoes');
    expect(pendente.analise.refeicoes).toHaveLength(2);
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toMatch(/uma só/i);
    expect(msg).toMatch(/separadas/i);
  });
});

// ------------------------------------------------------------------------
// resolverAmbiguidadeFoto — tipo='pessoas'
// ------------------------------------------------------------------------

describe('resolverAmbiguidadeFoto — pessoas', () => {
  it('"só eu" → macros originais preservados, foto_ambigua limpa, confirmacao_pendente setada', async () => {
    const analise = analiseBase({ ambiguidade: 'multiplos_pratos_parecidos' });

    const ok = await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'pessoas', analise }, 'só eu');

    expect(ok).toBe(true);
    // 2 chamadas de atualizarEstado: limpa foto_ambigua + seta confirmacao
    const limpezaFoto = ultimoEstadoCom('foto_ambigua_pendente');
    expect(limpezaFoto!['foto_ambigua_pendente']).toBeNull();
    const conf = ultimoEstadoCom('confirmacao_pendente');
    const confirmacao = conf!['confirmacao_pendente'] as { analise: AnalisePrato };
    expect(confirmacao.analise.macros.kcal).toBe(800);
    // Pergunta "Está correto?" enviada
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toMatch(/Está correto/i);
  });

  it('"somos 2" → macros divididos por 2 + aviso de divisão', async () => {
    const analise = analiseBase({ ambiguidade: 'multiplos_pratos_parecidos' });

    const ok = await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'pessoas', analise }, 'somos 2');

    expect(ok).toBe(true);
    const conf = ultimoEstadoCom('confirmacao_pendente');
    const confirmacao = conf!['confirmacao_pendente'] as { analise: AnalisePrato };
    expect(confirmacao.analise.macros.kcal).toBe(400); // 800/2
    expect(confirmacao.analise.macros.proteina_g).toBe(30); // 60/2
    expect(confirmacao.analise.aviso).toMatch(/dividida por 2/);
  });

  it('"somos 2" → descrições agregadas ("total"/"por prato") são reescritas em porção individual', async () => {
    const analise = analiseBase({
      ambiguidade: 'multiplos_pratos_parecidos',
      alimentos: [
        'Arroz ~200g por prato, 2 pratos = ~400g total',
        'Carne 300g no total',
        'Feijão 200ml cada prato',
      ],
    });

    await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'pessoas', analise }, 'somos 2');

    const conf = ultimoEstadoCom('confirmacao_pendente');
    const confirmacao = conf!['confirmacao_pendente'] as { analise: AnalisePrato };
    expect(confirmacao.analise.alimentos).toEqual([
      'Arroz ~200g',
      'Carne 150g',
      'Feijão 200ml',
    ]);
  });

  it('"não sei" → retorna false, NAO limpa estado nem envia confirmação', async () => {
    const analise = analiseBase({ ambiguidade: 'multiplos_pratos_parecidos' });

    const ok = await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'pessoas', analise }, 'não sei');

    expect(ok).toBe(false);
    expect(atualizarEstadoSpy).not.toHaveBeenCalled();
    expect(sendTextSpy).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------
// resolverAmbiguidadeFoto — tipo='refeicoes'
// ------------------------------------------------------------------------

describe('resolverAmbiguidadeFoto — refeicoes', () => {
  it('"separadas" com refeicoes[] cheio → N registros + card "N refeições registradas!"', async () => {
    const analise = analiseBase({
      ambiguidade: 'refeicoes_distintas',
      refeicoes: [
        { alimentos: ['arroz', 'feijão'], macros: { kcal: 400, proteina_g: 15, carbo_g: 60, gordura_g: 8 } },
        { alimentos: ['panqueca'], macros: { kcal: 400, proteina_g: 10, carbo_g: 55, gordura_g: 12 } },
      ],
    });

    const ok = await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'refeicoes', analise }, 'separadas');

    expect(ok).toBe(true);
    expect(registrarRefeicaoSpy).toHaveBeenCalledTimes(2);
    // Primeira refeição registrada com descrição "arroz, feijão"
    expect(registrarRefeicaoSpy.mock.calls[0][1]).toBe('arroz, feijão');
    expect(registrarRefeicaoSpy.mock.calls[1][1]).toBe('panqueca');
    // Origem 'foto'
    expect(registrarRefeicaoSpy.mock.calls[0][3]).toBe('foto');
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toMatch(/2 refeições registradas/);
    expect(dispararAlertaOvershootSpy).toHaveBeenCalled();
  });

  it('"uma só" → cai em handleConfirmacaoPrato agregado (0 registros diretos)', async () => {
    const analise = analiseBase({
      ambiguidade: 'refeicoes_distintas',
      refeicoes: [
        { alimentos: ['arroz'], macros: { kcal: 400, proteina_g: 15, carbo_g: 60, gordura_g: 8 } },
        { alimentos: ['panqueca'], macros: { kcal: 400, proteina_g: 10, carbo_g: 55, gordura_g: 12 } },
      ],
    });

    const ok = await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'refeicoes', analise }, 'uma só');

    expect(ok).toBe(true);
    expect(registrarRefeicaoSpy).not.toHaveBeenCalled();
    const conf = ultimoEstadoCom('confirmacao_pendente');
    const confirmacao = conf!['confirmacao_pendente'] as { analise: AnalisePrato };
    // Macros ficam no agregado original (soma)
    expect(confirmacao.analise.macros.kcal).toBe(800);
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toMatch(/Está correto/i);
  });

  it('"separadas" mas refeicoes indefinido → fallback pra confirmacao agregada', async () => {
    const analise = analiseBase({
      ambiguidade: 'refeicoes_distintas',
      refeicoes: undefined,
    });

    const ok = await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'refeicoes', analise }, 'separadas');

    expect(ok).toBe(true);
    // Nao registrou N — caiu no agregado
    expect(registrarRefeicaoSpy).not.toHaveBeenCalled();
    const conf = ultimoEstadoCom('confirmacao_pendente');
    expect(conf).toBeDefined();
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toMatch(/Está correto/i);
  });

  it('resposta ambigua "talvez" → retorna false, sem side effects', async () => {
    const analise = analiseBase({ ambiguidade: 'refeicoes_distintas' });

    const ok = await resolverAmbiguidadeFoto('5562999999999', paciente, { tipo: 'refeicoes', analise }, 'talvez');

    expect(ok).toBe(false);
    expect(atualizarEstadoSpy).not.toHaveBeenCalled();
    expect(registrarRefeicaoSpy).not.toHaveBeenCalled();
    expect(sendTextSpy).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------
// normalizarDescricoesIndividuais — helper puro usado na divisao por N
// ------------------------------------------------------------------------

describe('normalizarDescricoesIndividuais', () => {
  it('n=1 → retorna as descricoes intactas (sem divisao)', () => {
    const entrada = ['Arroz 200g no total', 'Feijão 100g por prato'];
    expect(normalizarDescricoesIndividuais(entrada, 1)).toEqual(entrada);
  });

  it('"X por prato, N pratos = ~Yg total" → mantem só o prefixo por-unidade', () => {
    expect(normalizarDescricoesIndividuais(
      ['Arroz ~200g por prato, 2 pratos = ~400g total'],
      2,
    )).toEqual(['Arroz ~200g']);
  });

  it('"X por pessoa" → mantem prefixo', () => {
    expect(normalizarDescricoesIndividuais(['Feijão 100g por pessoa'], 3))
      .toEqual(['Feijão 100g']);
  });

  it('"X 100g cada" e "X em cada prato" → mantem prefixo', () => {
    expect(normalizarDescricoesIndividuais(
      ['Salada 80g cada', 'Batata 150g em cada prato'],
      2,
    )).toEqual(['Salada 80g', 'Batata 150g']);
  });

  it('"X 300g no total" com n=3 → divide numero por n', () => {
    expect(normalizarDescricoesIndividuais(['Batata 300g no total'], 3))
      .toEqual(['Batata 100g']);
  });

  it('"X 200ml total" (sem "no") com n=2 → divide', () => {
    expect(normalizarDescricoesIndividuais(['Suco 200ml total'], 2))
      .toEqual(['Suco 100ml']);
  });

  it('sem sufixo de agregacao → devolve string como veio', () => {
    expect(normalizarDescricoesIndividuais(['Arroz 200g', 'Salada'], 2))
      .toEqual(['Arroz 200g', 'Salada']);
  });

  it('mistura de padroes numa unica chamada (cenario real da foto de mesa família)', () => {
    const entrada = [
      'Arroz ~200g por prato, 2 pratos = ~400g total',
      'Carne 300g no total',
      'Feijão 200ml cada prato',
      'Farofa 50g',
    ];
    expect(normalizarDescricoesIndividuais(entrada, 2)).toEqual([
      'Arroz ~200g',
      'Carne 150g',
      'Feijão 200ml',
      'Farofa 50g',
    ]);
  });
});
