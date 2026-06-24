import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// SEC-1: autenticacao via JWT do Supabase Auth.
// Antes: header `X-API-Key` com chave que o Vite inlineava no bundle publico
// — qualquer um podia ler o JS do painel e bater no backend. Agora o painel
// envia `Authorization: Bearer <access_token>` da sessao do nutricionista,
// e o backend valida via `auth.getUser(token)`. Sem chave compartilhada.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers['authorization'];
  if (!header || typeof header !== 'string' || !header.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
