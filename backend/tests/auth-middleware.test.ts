import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock antes do import: o middleware instancia o cliente Supabase no top-level.
const { getUserSpy } = vi.hoisted(() => ({
  getUserSpy: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: getUserSpy },
  }),
}));

import { requireAuth } from '../src/middleware/auth';

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json })) as unknown as Response['status'];
  return { status, json } as { status: Response['status']; json: ReturnType<typeof vi.fn> };
}

function makeReq(headers: Record<string, string | undefined> = {}): Request {
  return { headers } as unknown as Request;
}

beforeEach(() => {
  getUserSpy.mockReset();
});

describe('requireAuth — JWT Supabase no painel (SEC-1)', () => {
  it('sem Authorization → 401, nao chama supabase', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    await requireAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getUserSpy).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('Authorization sem "Bearer " → 401', async () => {
    const req = makeReq({ authorization: 'Basic xyz' });
    const res = makeRes();
    const next = vi.fn();
    await requireAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getUserSpy).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('Bearer com token vazio → 401', async () => {
    const req = makeReq({ authorization: 'Bearer   ' });
    const res = makeRes();
    const next = vi.fn();
    await requireAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  it('token invalido (auth.getUser retorna error) → 401', async () => {
    getUserSpy.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid JWT' },
    });
    const req = makeReq({ authorization: 'Bearer tok-ruim' });
    const res = makeRes();
    const next = vi.fn();
    await requireAuth(req, res as unknown as Response, next as NextFunction);
    expect(getUserSpy).toHaveBeenCalledWith('tok-ruim');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('token valido → next() (segue pra rota)', async () => {
    getUserSpy.mockResolvedValueOnce({
      data: { user: { id: 'u-1', email: 'nutri@x.com' } },
      error: null,
    });
    const req = makeReq({ authorization: 'Bearer tok-bom' });
    const res = makeRes();
    const next = vi.fn();
    await requireAuth(req, res as unknown as Response, next as NextFunction);
    expect(getUserSpy).toHaveBeenCalledWith('tok-bom');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('header case-insensitive ("bearer ..." minusculo) → aceita', async () => {
    getUserSpy.mockResolvedValueOnce({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const req = makeReq({ authorization: 'bearer tok-bom' });
    const res = makeRes();
    const next = vi.fn();
    await requireAuth(req, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
