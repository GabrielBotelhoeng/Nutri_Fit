import { supabase } from './supabase';

// Anexa `Authorization: Bearer <access_token>` da sessao Supabase Auth.
// Backend valida o JWT antes de servir qualquer rota /api/pacientes.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = import.meta.env.VITE_BACKEND_URL as string;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${base}${path}`, { ...init, headers });
}
