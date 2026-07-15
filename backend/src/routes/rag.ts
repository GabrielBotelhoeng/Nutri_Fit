import { Router, Request, Response, NextFunction } from 'express';
import { processarDieta } from '../services/rag';
import { env } from '../config/env';

export const ragRouter = Router();

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

interface ProcessarBody {
  paciente_id: string;
  dieta_id: string;
  pdf_url: string;
}

ragRouter.post('/processar', requireInternalKey, async (req: Request, res: Response) => {
  const { paciente_id, dieta_id, pdf_url } = req.body as ProcessarBody;

  if (!paciente_id || !dieta_id || !pdf_url) {
    res.status(400).json({ error: 'paciente_id, dieta_id e pdf_url sao obrigatorios' });
    return;
  }

  res.status(202).json({ status: 'processando', dieta_id });

  processarDieta(paciente_id, dieta_id, pdf_url).catch((err) => {
    console.error(`[rag] Falha ao processar dieta ${dieta_id}:`, err);
  });
});
