import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spies controlaveis por teste — embedQuery e rpc.
const { embedQuerySpy, rpcSpy } = vi.hoisted(() => ({
  embedQuerySpy: vi.fn(),
  rpcSpy: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: class {
    embedDocuments = vi.fn(async () => []);
    embedQuery = embedQuerySpy;
  },
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({ text: '' })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ download: vi.fn(), upload: vi.fn() }) },
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    rpc: rpcSpy,
  }),
}));

import { query } from '../src/services/rag';

beforeEach(() => {
  embedQuerySpy.mockReset();
  rpcSpy.mockReset();
});

describe('rag.query — fail-soft em 429 da OpenAI', () => {
  it('embedQuery lanca (apos esgotar retries do AsyncCaller) → retorna "" sem propagar', async () => {
    const err = Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    embedQuerySpy.mockRejectedValueOnce(err);

    const resultado = await query('paciente-id', 'que horas tomo o suplemento?');

    expect(resultado).toBe('');
    // Importante: NAO chama supabase.rpc quando o embedding falha — sem embedding,
    // nao tem o que mandar pro match_chunks_paciente.
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('embedQuery sucesso + rpc com erro → retorna "" (caminho existente)', async () => {
    embedQuerySpy.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: 'rpc fail' } });

    const resultado = await query('paciente-id', 'pergunta');

    expect(resultado).toBe('');
    expect(rpcSpy).toHaveBeenCalledOnce();
  });

  it('embedQuery sucesso + rpc retorna chunks → concatena com \\n\\n', async () => {
    embedQuerySpy.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    rpcSpy.mockResolvedValueOnce({
      data: [{ content: 'chunk 1' }, { content: 'chunk 2' }],
      error: null,
    });

    const resultado = await query('paciente-id', 'pergunta');

    expect(resultado).toBe('chunk 1\n\nchunk 2');
  });
});
