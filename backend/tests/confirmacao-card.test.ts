import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug D-06 fix (2026-07-08) — Opcao C1: correcao parcial via Haiku.
// Card de foto + texto livre ("bife 200g e feijao 100g") → Haiku faz merge
// mantendo itens nao mencionados. Testes cobrem:
//  - interpretarRespostaConfirmacao (helper puro, sim/nao/outro)
//  - aplicarCorrecaoParcial (Haiku retorna analise atualizada / invalido / vazio)
//  - montarTextoCard (formato inclui 3 opcoes)

const { claudeState } = vi.hoisted(() => ({
  claudeState: { text: '{}' } as { text: string },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn(async () => ({ content: [{ type: 'text', text: claudeState.text }] })),
    };
  },
}));

vi.mock('../src/services/evolution', () => ({
  sendText: vi.fn(async () => undefined),
}));

vi.mock('../src/services/conversation', () => ({
  getEstado: vi.fn(async () => ({ dados: {} })),
  atualizarEstado: vi.fn(async () => undefined),
  buscarPacientePorWhatsapp: vi.fn(async () => ({ id: 'pac-1', nome: 'Gabi' })),
}));

vi.mock('../src/services/meal', () => ({
  registrarRefeicao: vi.fn(async () => ({ id: 'ref-x', registrado_em: new Date().toISOString() })),
  obterSaldoDia: vi.fn(async () => ({ kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 })),
  calcularStreak: vi.fn(async () => ({ proteina: 0, kcal: 0, batendo_hoje_proteina: false, batendo_hoje_kcal: false })),
  dispararAlertaOvershoot: vi.fn(async () => undefined),
  formatarBlocoProgressoDia: vi.fn(() => '📊 bloco'),
  formatarSaldoDia: vi.fn(() => '📊 saldo'),
}));

vi.mock('../src/services/audio', () => ({
  downloadMedia: vi.fn(async () => ({ buffer: Buffer.from('x'), mimetype: 'image/jpeg' })),
}));

vi.mock('../src/services/barcode', () => ({
  processarCodigoBarras: vi.fn(async () => null),
}));

import {
  interpretarRespostaConfirmacao,
  montarTextoCard,
  aplicarCorrecaoParcial,
  type AnalisePrato,
} from '../src/services/vision';

function makeAnalise(over: Partial<AnalisePrato> = {}): AnalisePrato {
  return {
    alimentos: ['arroz 150g', 'feijão 100g', 'bife 100g', 'salada 50g'],
    confianca: 'media',
    macros: { kcal: 600, proteina_g: 40, carbo_g: 70, gordura_g: 15 },
    aviso: null,
    ambiguidade: 'nenhuma',
    ...over,
  };
}

// ------------------------------------------------------------------------
// interpretarRespostaConfirmacao — funcao pura
// ------------------------------------------------------------------------

describe('interpretarRespostaConfirmacao', () => {
  it('aceita "sim", "s", "yes", "ok", "👍" como sim (case-insensitive + trim)', () => {
    expect(interpretarRespostaConfirmacao('sim')).toBe('sim');
    expect(interpretarRespostaConfirmacao('SIM')).toBe('sim');
    expect(interpretarRespostaConfirmacao(' sim ')).toBe('sim');
    expect(interpretarRespostaConfirmacao('s')).toBe('sim');
    expect(interpretarRespostaConfirmacao('S')).toBe('sim');
    expect(interpretarRespostaConfirmacao('yes')).toBe('sim');
    expect(interpretarRespostaConfirmacao('ok')).toBe('sim');
    expect(interpretarRespostaConfirmacao('👍')).toBe('sim');
  });

  it('aceita "não", "nao", "n", "no" como nao (com/sem acento)', () => {
    expect(interpretarRespostaConfirmacao('não')).toBe('nao');
    expect(interpretarRespostaConfirmacao('nao')).toBe('nao');
    expect(interpretarRespostaConfirmacao('NÃO')).toBe('nao');
    expect(interpretarRespostaConfirmacao(' não ')).toBe('nao');
    expect(interpretarRespostaConfirmacao('n')).toBe('nao');
    expect(interpretarRespostaConfirmacao('N')).toBe('nao');
    expect(interpretarRespostaConfirmacao('no')).toBe('nao');
  });

  it('descricao de refeicao vira "outro" (bug D-06 — cancela card em vez de somar)', () => {
    expect(interpretarRespostaConfirmacao('70g de abobrinha e 70g de ovo cozido')).toBe('outro');
    expect(interpretarRespostaConfirmacao('São 100g de arroz e 150g de frango')).toBe('outro');
    expect(interpretarRespostaConfirmacao('na verdade eram 80g')).toBe('outro');
    expect(interpretarRespostaConfirmacao('comi 200g de peito de frango')).toBe('outro');
  });

  it('consulta vira "outro" (nao confirma nem cancela nada)', () => {
    expect(interpretarRespostaConfirmacao('quantas calorias?')).toBe('outro');
    expect(interpretarRespostaConfirmacao('qual minha meta de proteina?')).toBe('outro');
  });

  it('string vazia vira "outro" (nao confirma)', () => {
    expect(interpretarRespostaConfirmacao('')).toBe('outro');
    expect(interpretarRespostaConfirmacao('   ')).toBe('outro');
  });

  it('"simba" e "sim, agora" NAO viram sim (evita false positive)', () => {
    // "sim" precisa ser o texto INTEIRO. "sim, agora" tem virgula — o
    // classificador de intent trata como refeicao nova / consulta.
    expect(interpretarRespostaConfirmacao('simba')).toBe('outro');
    expect(interpretarRespostaConfirmacao('sim, agora')).toBe('outro');
    expect(interpretarRespostaConfirmacao('sim!!!')).toBe('outro');
  });
});

// ------------------------------------------------------------------------
// montarTextoCard — formato do card (3 opcoes + header customizavel)
// ------------------------------------------------------------------------

describe('montarTextoCard', () => {
  it('lista alimentos numerados e inclui as 3 opcoes (sim / nao / correcao)', () => {
    const t = montarTextoCard(makeAnalise());
    expect(t).toContain('📸 Identifiquei na foto:');
    expect(t).toContain('1. arroz 150g');
    expect(t).toContain('4. salada 50g');
    expect(t).toContain('Est. 600 kcal');
    expect(t).toContain('*sim* para registrar');
    expect(t).toContain('*não* para cancelar');
    expect(t).toContain('me manda a refeição corrigida por texto');
  });

  it('cabecalho custom substitui default (usado pos-correcao — "✏️ Corrigi a análise:")', () => {
    const t = montarTextoCard(makeAnalise(), undefined, '✏️ Corrigi a análise:');
    expect(t).toContain('✏️ Corrigi a análise:');
    expect(t).not.toContain('📸 Identifiquei na foto:');
  });

  it('confianca=baixa adiciona aviso de baixa confianca', () => {
    const t = montarTextoCard(makeAnalise({ confianca: 'baixa' }));
    expect(t).toContain('⚠️ Baixa confiança');
  });

  it('avisoExtra e apendado depois da linha de kcal', () => {
    const t = montarTextoCard(makeAnalise(), '⚠️ Estimativa baseada em apenas 1 foto');
    expect(t).toContain('⚠️ Estimativa baseada em apenas 1 foto');
  });
});

// ------------------------------------------------------------------------
// aplicarCorrecaoParcial — Bug D-06 Opcao C1
// Merge via Haiku: mantem itens nao mencionados + substitui quantidades
// ------------------------------------------------------------------------

describe('aplicarCorrecaoParcial', () => {
  const original = makeAnalise();

  beforeEach(() => {
    claudeState.text = '{}';
  });

  it('Haiku retorna analise valida → devolve AnalisePrato com itens merged e macros novos', async () => {
    claudeState.text = JSON.stringify({
      alimentos: ['arroz 150g', 'feijão 200g', 'bife 200g', 'salada 50g'],
      confianca: 'media',
      kcal: 850,
      proteina_g: 65,
      carbo_g: 90,
      gordura_g: 20,
      aviso: null,
    });
    const r = await aplicarCorrecaoParcial(original, 'bife 200g e feijão 200g');
    expect(r).not.toBeNull();
    expect(r!.alimentos).toEqual(['arroz 150g', 'feijão 200g', 'bife 200g', 'salada 50g']);
    expect(r!.macros.kcal).toBe(850);
    expect(r!.macros.proteina_g).toBe(65);
    expect(r!.macros.carbo_g).toBe(90);
    expect(r!.macros.gordura_g).toBe(20);
    expect(r!.confianca).toBe('media');
    // ambiguidade sempre 'nenhuma' pos-correcao — se paciente ja chegou ao
    // card, a ambiguidade da foto ja foi resolvida.
    expect(r!.ambiguidade).toBe('nenhuma');
  });

  it('Haiku responde {"invalido": true} → retorna null (fallback pro classificador de intent)', async () => {
    claudeState.text = '{"invalido": true}';
    const r = await aplicarCorrecaoParcial(original, 'quantas calorias essa refeicao tem?');
    expect(r).toBeNull();
  });

  it('Haiku retorna JSON vazio {} → retorna null (guard alimentos.length===0)', async () => {
    claudeState.text = '{}';
    const r = await aplicarCorrecaoParcial(original, 'bife 200g');
    expect(r).toBeNull();
  });

  it('Haiku retorna alimentos vazio [] → retorna null', async () => {
    claudeState.text = JSON.stringify({ alimentos: [], kcal: 500, proteina_g: 30 });
    const r = await aplicarCorrecaoParcial(original, 'bife 200g');
    expect(r).toBeNull();
  });

  it('Haiku retorna kcal=0 → retorna null (guard kcal===0 evita registrar refeicao sem valor)', async () => {
    claudeState.text = JSON.stringify({
      alimentos: ['bife 200g'],
      kcal: 0,
      proteina_g: 0,
      carbo_g: 0,
      gordura_g: 0,
    });
    const r = await aplicarCorrecaoParcial(original, 'bife 200g');
    expect(r).toBeNull();
  });

  it('Haiku retorna JSON invalido (nao-parseavel) → retorna null (try/catch)', async () => {
    claudeState.text = 'isso nao eh JSON valido {{{';
    const r = await aplicarCorrecaoParcial(original, 'bife 200g');
    expect(r).toBeNull();
  });

  it('confianca ausente na resposta → default "media"', async () => {
    claudeState.text = JSON.stringify({
      alimentos: ['bife 200g'],
      kcal: 500,
      proteina_g: 40,
      carbo_g: 0,
      gordura_g: 15,
    });
    const r = await aplicarCorrecaoParcial(original, 'bife 200g');
    expect(r).not.toBeNull();
    expect(r!.confianca).toBe('media');
  });

  it('macros ausentes na resposta (so alimentos + kcal) → viram 0 (Number(undefined) || 0)', async () => {
    claudeState.text = JSON.stringify({ alimentos: ['x 100g'], kcal: 300 });
    const r = await aplicarCorrecaoParcial(original, 'x 100g');
    expect(r).not.toBeNull();
    expect(r!.macros.kcal).toBe(300);
    expect(r!.macros.proteina_g).toBe(0);
    expect(r!.macros.carbo_g).toBe(0);
    expect(r!.macros.gordura_g).toBe(0);
  });
});
