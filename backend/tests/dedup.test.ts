import { describe, it, expect, vi, beforeEach } from 'vitest';

// O dedup.ts instancia createClient no top-level — precisa mockar antes do import.
// O spy expoe o `insert` para podermos configurar retorno por teste.
const { insertSpy } = vi.hoisted(() => ({
  insertSpy: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ insert: insertSpy }),
  }),
}));

import { marcarMensagemProcessada } from '../src/services/dedup';

beforeEach(() => {
  insertSpy.mockReset();
});

describe('marcarMensagemProcessada — dedup do webhook (P2-7)', () => {
  it('message_id novo → INSERT sucede e retorna true (processar)', async () => {
    insertSpy.mockResolvedValueOnce({ error: null });
    const r = await marcarMensagemProcessada('msg-novo-001');
    expect(r).toBe(true);
    expect(insertSpy).toHaveBeenCalledWith({ message_id: 'msg-novo-001' });
  });

  it('message_id duplicado (PgError 23505) → retorna false (descartar)', async () => {
    insertSpy.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    const r = await marcarMensagemProcessada('msg-duplicado');
    expect(r).toBe(false);
  });

  it('erro de infra (rede/DB offline) → fail-open, retorna true', async () => {
    // Codigo != 23505 indica falha de infra, nao duplicacao real.
    // O agente deve seguir processando — vale mais entregar 2x do que perder.
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    insertSpy.mockResolvedValueOnce({
      error: { code: '08006', message: 'connection failure' },
    });
    const r = await marcarMensagemProcessada('msg-com-falha-infra');
    expect(r).toBe(true);
    expect(erroSpy).toHaveBeenCalled();
    erroSpy.mockRestore();
  });

  it('messageId vazio → retorna true sem chamar DB (mensagem sem id processa normal)', async () => {
    // Defesa: payload mal-formado da Evolution nao deve bloquear.
    const r = await marcarMensagemProcessada('');
    expect(r).toBe(true);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('dois inserts do mesmo id — primeiro processa, segundo descarta', async () => {
    insertSpy
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({
        error: { code: '23505', message: 'duplicate key' },
      });

    const r1 = await marcarMensagemProcessada('msg-repetida');
    const r2 = await marcarMensagemProcessada('msg-repetida');

    expect(r1).toBe(true);
    expect(r2).toBe(false);
    expect(insertSpy).toHaveBeenCalledTimes(2);
  });
});
