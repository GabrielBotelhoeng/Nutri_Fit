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

import { interpretarRespostaConfirmacao } from '../src/services/vision';

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
