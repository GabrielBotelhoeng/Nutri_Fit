import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireWebhookAuth } from '../src/middleware/webhookAuth';

// O setup.ts congela `EVOLUTION_WEBHOOK_SECRET = 'test-webhook-secret'` antes
// do primeiro import de env. Os asserts comparam contra esse valor.
const SECRET = 'test-webhook-secret';

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json })) as unknown as Response['status'];
  return { status, json } as { status: Response['status']; json: ReturnType<typeof vi.fn> };
}

function makeReq(
  headers: Record<string, string | string[] | undefined> = {},
  query: Record<string, unknown> = {},
): Request {
  return { headers, query } as unknown as Request;
}

describe('requireWebhookAuth — autenticacao do webhook da Evolution (SEC-2)', () => {
  it('sem header X-Webhook-Secret → 401, nao chama next', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('header com secret errado → 401', () => {
    const req = makeReq({ 'x-webhook-secret': 'errado' });
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('header com tamanho menor → 401 (hash normaliza, sem leak via length)', () => {
    const req = makeReq({ 'x-webhook-secret': 'x' });
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('header com secret correto → next()', () => {
    const req = makeReq({ 'x-webhook-secret': SECRET });
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('header como array (caso raro de express com header duplicado) → 401', () => {
    const req = makeReq({ 'x-webhook-secret': [SECRET] });
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('query ?secret com valor correto → next() (Evolution v1 sem header custom)', () => {
    const req = makeReq({}, { secret: SECRET });
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('query ?secret com valor errado → 401', () => {
    const req = makeReq({}, { secret: 'errado' });
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('query ?secret como array (parser trata ?secret=a&secret=b) → 401', () => {
    const req = makeReq({}, { secret: [SECRET] });
    const res = makeRes();
    const next = vi.fn();
    requireWebhookAuth(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
