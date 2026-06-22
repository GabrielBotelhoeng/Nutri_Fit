import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

export const aguaRouter = Router();

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

aguaRouter.post('/registrar', requireInternalKey, async (req: Request, res: Response) => {
  const { paciente_id, agua_ml } = req.body as { paciente_id?: string; agua_ml?: number };

  if (!paciente_id || !agua_ml || agua_ml <= 0 || agua_ml > 5000) {
    res.status(400).json({ error: 'paciente_id e agua_ml (1-5000) sao obrigatorios' });
    return;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const hoje = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.rpc('registrar_agua_diaria', {
    p_paciente_id: paciente_id,
    p_data: hoje,
    p_agua_ml: agua_ml,
  });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ status: 'registrado', agua_ml, data: hoje });
});
