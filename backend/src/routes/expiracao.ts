import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { verificarExpiracoes } from '../services/expiracao';

export const expiracaoRouter = Router();

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

expiracaoRouter.post('/verificar', requireInternalKey, async (_req: Request, res: Response) => {
  res.status(202).json({ status: 'processando' });
  verificarExpiracoes().catch((err) => {
    console.error('[expiracao] Erro na verificacao:', err);
  });
});
