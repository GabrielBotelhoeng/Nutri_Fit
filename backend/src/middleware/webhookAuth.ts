import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

// Prova a origem do webhook (sem isso, POST forjado em /api/webhook viraria
// mensagem de qualquer telefone). Evolution injeta X-Webhook-Secret no
// setWebhook. Comparacao SHA-256 + timingSafeEqual evita timing attack;
// hash normaliza tamanhos (timingSafeEqual exige buffers do mesmo length,
// e checar length antes ja vaza informacao).
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
