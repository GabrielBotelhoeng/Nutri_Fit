import { describe, it, expect, vi, beforeEach } from 'vitest';

// Agentes de teste 2026-10-23 (cenário 01d): "na verdade foram 150g de arroz" depois de
// "300g de arroz e 100g de frango" trocava a refeição INTEIRA só pelo arroz — o frango
// sumia, o dia caía de 555 pra 195 kcal e a descrição virava a frase literal da correção.
// Causa: os macros eram calculados só a partir do texto da correção.

const { prompts, updates, claudeResposta } = vi.hoisted(() => ({
  prompts: [] as string[],
  updates: [] as Record<string, unknown>[],
  claudeResposta: { texto: '' },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn(async (args: { messages: { content: string }[] }) => {
        prompts.push(args.messages.map((m) => m.content).join('\n'));
        return { content: [{ type: 'text', text: claudeResposta.texto }] };
      }),
    };
  },
}));

vi.mock('@supabase/supabase-js', () => {
  const resultado = { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'in', 'delete']) chain[m] = () => chain;
  chain.single = async () => resultado;
  chain.maybeSingle = async () => resultado;
  chain.then = (r: (v: unknown) => void) => r({ data: [], error: null });
  chain.update = (patch: Record<string, unknown>) => {
    updates.push(patch);
    return chain;
  };
  return { createClient: () => ({ from: () => chain, rpc: async () => ({ error: null }) }) };
});
vi.mock('../src/services/evolution', () => ({ sendText: vi.fn(async () => undefined) }));
vi.mock('../src/services/rag', () => ({ ragQuery: vi.fn(async () => '') }));
vi.mock('../src/services/conversation', () => ({
  getEstado: vi.fn(async () => ({ status: 'completa', etapa: 14, dados: {} })),
  atualizarEstado: vi.fn(async () => undefined),
}));

import { processarTextoCorrecao, type UltimaRefeicao } from '../src/services/meal';

const ultima: UltimaRefeicao = {
  id: 'ref-1',
  descricao: 'almocei 300g de arroz e 100g de frango grelhado',
  macros: { kcal: 555, proteina_g: 38, carbo_g: 60, gordura_g: 6 },
  itens: [
    { nome: 'Arroz branco', quantidade_g: 300, quantidade_informada: true, material: true, kcal: 390 },
    { nome: 'Frango grelhado', quantidade_g: 100, quantidade_informada: true, material: true, kcal: 165 },
  ],
  registrado_em: new Date().toISOString(),
};

const paciente = { id: 'pac-1', nome: 'Teste', whatsapp: '5599900000001' } as Parameters<typeof processarTextoCorrecao>[2];

beforeEach(() => {
  prompts.length = 0;
  updates.length = 0;
  claudeResposta.texto = JSON.stringify({
    refeicoes: [
      {
        tipo_refeicao: null,
        itens: [
          { nome: 'Arroz branco', quantidade_g: 150, quantidade_informada: true, material: true, preparo_inferido: false, kcal: 195 },
          { nome: 'Frango grelhado', quantidade_g: 100, quantidade_informada: true, material: true, preparo_inferido: false, kcal: 165 },
        ],
        totais: { kcal: 360, proteina_g: 35, carbo_g: 43, gordura_g: 4 },
      },
    ],
  });
});

describe('processarTextoCorrecao — mantém os itens não corrigidos', () => {
  it('o modelo recebe a refeição registrada (com o frango) junto com a correção', async () => {
    await processarTextoCorrecao(paciente.whatsapp, 'na verdade foram 150g de arroz', paciente, ultima);
    const prompt = prompts.join('\n');
    // Formato que não aparece nos exemplos fixos do prompt — prova que a refeição
    // registrada foi de fato enviada junto com a correção.
    expect(prompt).toContain('Arroz branco 300g');
    expect(prompt).toContain('Frango grelhado 100g');
    expect(prompt).toContain('na verdade foram 150g de arroz');
  });

  it('a refeição gravada continua com o frango e a descrição lista os itens', async () => {
    await processarTextoCorrecao(paciente.whatsapp, 'na verdade foram 150g de arroz', paciente, ultima);
    const correcao = updates.find((u) => 'kcal' in u);
    expect(correcao?.kcal).toBe(360);
    expect(String(correcao?.descricao)).toMatch(/Frango grelhado/);
    expect(String(correcao?.descricao)).not.toMatch(/na verdade/);
  });
});
