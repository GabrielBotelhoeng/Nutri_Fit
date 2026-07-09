import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug 2 (2026-07-09): protege o few-shot de mesa de servir / mesa família no
// prompt de analisarPrato. UAT WhatsApp confirmou que Sonnet 4.6 agora classifica
// bandejas/travessas de servir como multiplos_pratos_parecidos (antes retornava
// 'nenhuma' e agregava tudo como porção do paciente).

const anthropicCreateSpy = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreateSpy };
  },
}));

vi.mock('../src/services/evolution', () => ({ sendText: vi.fn() }));
vi.mock('../src/services/conversation', () => ({
  getEstado: vi.fn(),
  atualizarEstado: vi.fn(),
  buscarPacientePorWhatsapp: vi.fn(),
}));
vi.mock('../src/services/meal', () => ({
  registrarRefeicao: vi.fn(),
  obterSaldoDia: vi.fn(),
  calcularStreak: vi.fn(),
  dispararAlertaOvershoot: vi.fn(),
  formatarBlocoProgressoDia: vi.fn(),
  formatarSaldoDia: vi.fn(),
}));
vi.mock('../src/services/audio', () => ({ downloadMedia: vi.fn() }));
vi.mock('../src/services/barcode', () => ({ processarCodigoBarras: vi.fn() }));

import { analisarPrato } from '../src/services/vision';

beforeEach(() => {
  anthropicCreateSpy.mockReset();
});

describe('analisarPrato — parse de ambiguidade (Bug 2)', () => {
  it('preserva ambiguidade="multiplos_pratos_parecidos" quando Claude retorna cenário mesa de servir', async () => {
    anthropicCreateSpy.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          alimentos: ['Arroz ~400g total', 'Carne ~300g total', 'Feijão ~400ml total', 'Farofa ~100g'],
          confianca: 'media',
          kcal: 3200, proteina_g: 160, carbo_g: 390, gordura_g: 85,
          aviso: 'Foto contém 2 pratos servidos + 2 tigelas — provável mesa para 2 pessoas.',
          ambiguidade: 'multiplos_pratos_parecidos',
          refeicoes: null,
        }),
      }],
    });

    const analise = await analisarPrato(['b64_1', 'b64_2'], 'image/jpeg');

    expect(analise.ambiguidade).toBe('multiplos_pratos_parecidos');
    expect(analise.macros.kcal).toBe(3200);
    expect(analise.alimentos).toHaveLength(4);
    expect(analise.refeicoes).toBeUndefined();
  });

  it('normaliza ambiguidade desconhecida (ex: "quase_mesa") para "nenhuma"', async () => {
    anthropicCreateSpy.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          alimentos: ['arroz 150g', 'frango 200g'],
          confianca: 'alta', kcal: 500, proteina_g: 40, carbo_g: 60, gordura_g: 10,
          aviso: null, ambiguidade: 'quase_mesa', refeicoes: null,
        }),
      }],
    });

    const analise = await analisarPrato(['b64'], 'image/jpeg');
    expect(analise.ambiguidade).toBe('nenhuma');
  });

  it('promptAviso de 2 fotos menciona "cenas diferentes" (protege ajuste do fix Bug 2)', async () => {
    anthropicCreateSpy.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{}' }],
    });

    await analisarPrato(['b64_1', 'b64_2'], 'image/jpeg');

    const promptEnviado = (anthropicCreateSpy.mock.calls[0][0] as {
      messages: { content: { type: string; text?: string }[] }[];
    }).messages[0].content.find((c) => c.type === 'text')?.text ?? '';
    expect(promptEnviado).toMatch(/cenas diferentes/i);
    expect(promptEnviado).toMatch(/mesa da família|bandejas de servir|bandejas\/travessas/i);
  });

  it('few-shot no prompt inclui exemplo explícito de bandejas de servir familiar', async () => {
    anthropicCreateSpy.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{}' }],
    });

    await analisarPrato(['b64'], 'image/jpeg');

    const promptEnviado = (anthropicCreateSpy.mock.calls[0][0] as {
      messages: { content: { type: string; text?: string }[] }[];
    }).messages[0].content.find((c) => c.type === 'text')?.text ?? '';
    expect(promptEnviado).toMatch(/self-service familiar|bandejas de servir|travessas de compartilhamento/i);
    expect(promptEnviado).toMatch(/EXEMPLOS/);
  });
});
