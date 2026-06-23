import { describe, it, expect, vi, beforeEach } from 'vitest';

// conversaHistorico.ts instancia createClient no top-level — mockar antes do import.
// Spies hoisted pra configurar retorno por teste.
const { insertSpy, selectChain } = vi.hoisted(() => {
  const insertSpy = vi.fn();
  // Cadeia .select().eq().order().limit() — cada elo retorna o mesmo objeto
  // ate o ultimo, que resolve. O limit e que devolve { data, error }.
  const limitSpy = vi.fn();
  const orderSpy = vi.fn(() => ({ limit: limitSpy }));
  const eqSpy = vi.fn(() => ({ order: orderSpy }));
  const selectSpy = vi.fn(() => ({ eq: eqSpy }));
  return {
    insertSpy,
    selectChain: { selectSpy, eqSpy, orderSpy, limitSpy },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: insertSpy,
      select: selectChain.selectSpy,
    }),
  }),
}));

import {
  registrarMensagem,
  obterUltimasMensagens,
} from '../src/services/conversaHistorico';

beforeEach(() => {
  insertSpy.mockReset();
  selectChain.selectSpy.mockClear();
  selectChain.eqSpy.mockClear();
  selectChain.orderSpy.mockClear();
  selectChain.limitSpy.mockReset();
});

describe('registrarMensagem — append de turno (P2-9)', () => {
  it('insere paciente_id + role + content', async () => {
    insertSpy.mockResolvedValueOnce({ error: null });
    await registrarMensagem('pac-123', 'user', 'qual o cafe?');
    expect(insertSpy).toHaveBeenCalledWith({
      paciente_id: 'pac-123',
      role: 'user',
      content: 'qual o cafe?',
    });
  });

  it('erro de DB → loga e nao throw (fail-soft)', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    insertSpy.mockResolvedValueOnce({
      error: { code: '08006', message: 'connection failure' },
    });
    // Nao deve throw — memoria e desejavel, nao critica.
    await expect(
      registrarMensagem('pac-123', 'assistant', 'resposta'),
    ).resolves.toBeUndefined();
    expect(erroSpy).toHaveBeenCalled();
    erroSpy.mockRestore();
  });
});

describe('obterUltimasMensagens — leitura cronologica (P2-9)', () => {
  it('reverte ordem DESC do DB pra cronologica (antiga -> nova)', async () => {
    // DB devolve DESC (mais nova primeiro) por causa do index.
    // A funcao deve reverter pra ordem cronologica (mais antiga primeiro).
    selectChain.limitSpy.mockResolvedValueOnce({
      data: [
        { role: 'assistant', content: 'resposta-3' },
        { role: 'user', content: 'pergunta-3' },
        { role: 'assistant', content: 'resposta-2' },
        { role: 'user', content: 'pergunta-2' },
      ],
      error: null,
    });

    const r = await obterUltimasMensagens('pac-123', 12);

    expect(r).toEqual([
      { role: 'user', content: 'pergunta-2' },
      { role: 'assistant', content: 'resposta-2' },
      { role: 'user', content: 'pergunta-3' },
      { role: 'assistant', content: 'resposta-3' },
    ]);
    expect(selectChain.selectSpy).toHaveBeenCalledWith('role, content');
    expect(selectChain.eqSpy).toHaveBeenCalledWith('paciente_id', 'pac-123');
    expect(selectChain.orderSpy).toHaveBeenCalledWith('criado_em', { ascending: false });
    expect(selectChain.limitSpy).toHaveBeenCalledWith(12);
  });

  it('limite default = 12', async () => {
    selectChain.limitSpy.mockResolvedValueOnce({ data: [], error: null });
    await obterUltimasMensagens('pac-123');
    expect(selectChain.limitSpy).toHaveBeenCalledWith(12);
  });

  it('erro de DB → fail-soft, retorna [] (Claude responde sem historico)', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    selectChain.limitSpy.mockResolvedValueOnce({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });
    const r = await obterUltimasMensagens('pac-123', 12);
    expect(r).toEqual([]);
    expect(erroSpy).toHaveBeenCalled();
    erroSpy.mockRestore();
  });

  it('paciente sem historico → retorna []', async () => {
    selectChain.limitSpy.mockResolvedValueOnce({ data: [], error: null });
    const r = await obterUltimasMensagens('pac-novo', 12);
    expect(r).toEqual([]);
  });
});
