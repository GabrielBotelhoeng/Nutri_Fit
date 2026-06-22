import { Router, Request, Response, NextFunction } from 'express';
import { enviarBoasVindas } from '../services/agent';
import { env } from '../config/env';

export const boasVindasRouter = Router();

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

boasVindasRouter.post('/:pacienteId', requireInternalKey, async (req: Request, res: Response) => {
  const { pacienteId } = req.params;

  res.status(202).json({ status: 'enviando', paciente_id: pacienteId });

  enviarBoasVindas(pacienteId).catch((err) => {
    console.error(`[boas-vindas] Falha para paciente ${pacienteId}:`, err);
  });
});
