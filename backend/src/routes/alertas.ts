import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { dispararAlertas } from '../services/alertas';

export const alertasRouter = Router();

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

const HORARIO_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

alertasRouter.post('/disparar', requireInternalKey, async (req: Request, res: Response) => {
  const { horario } = req.body as { horario?: string };

  if (!horario || !HORARIO_RE.test(horario)) {
    res.status(400).json({ error: 'horario invalido — formato esperado: HH:MM (ex: 07:30)' });
    return;
  }

  res.status(202).json({ status: 'processando', horario });

  dispararAlertas(horario).catch((err) => {
    console.error('[alertas] Erro ao disparar alertas:', err);
  });
});
