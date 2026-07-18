import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

// Prova a origem do webhook (sem isso, POST forjado em /api/webhook viraria
// mensagem de qualquer telefone). Evolution v2 injeta X-Webhook-Secret no
// setWebhook; v1.8.x nao suporta headers custom, entao aceitamos tambem
// ?secret= na query string (URL do webhook fica com o secret embutido).
// Comparacao SHA-256 + timingSafeEqual evita timing attack; hash normaliza
// tamanhos (timingSafeEqual exige buffers do mesmo length, e checar length
// antes ja vaza informacao).
export function requireWebhookAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const headerRaw = req.headers['x-webhook-secret'];
  const header = typeof headerRaw === 'string' ? headerRaw : '';

  const queryRaw = req.query?.secret;
  const query = typeof queryRaw === 'string' ? queryRaw : '';

  const provided = header || query;
  const expected = env.EVOLUTION_WEBHOOK_SECRET;

  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();

  if (!timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
