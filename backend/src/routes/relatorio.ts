import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { gerarRelatorioSemanal } from '../services/relatorio';

export const relatorioRouter = Router();

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

relatorioRouter.post('/semanal', requireInternalKey, async (_req: Request, res: Response) => {
  res.status(202).json({ status: 'processando' });
  gerarRelatorioSemanal().catch((err) => {
    console.error('[relatorio] Erro ao gerar relatorio semanal:', err);
  });
});
