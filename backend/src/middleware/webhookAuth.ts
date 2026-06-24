import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

// SEC-2: autenticacao do webhook da Evolution API. Antes desta verificacao,
// qualquer POST forjado em `/api/webhook` virava mensagem de qualquer telefone
// (o handler so olhava o payload, sem provar a origem). Agora a Evolution e
// configurada com header `X-Webhook-Secret` no setWebhook, e o backend rejeita
// 401 em todo request sem esse header valido.
//
// Comparacao em tempo constante via SHA-256 + timingSafeEqual evita timing
// attack — sem isso, o attacker poderia inferir o secret byte-a-byte pelo
// tempo de resposta. Hash normaliza tamanhos diferentes (timingSafeEqual exige
// buffers de mesmo length; se compararmos length antes, ja vaza informacao).
export function requireWebhookAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers['x-webhook-secret'];
  const provided = typeof header === 'string' ? header : '';
  const expected = env.EVOLUTION_WEBHOOK_SECRET;

  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();

  if (!timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
