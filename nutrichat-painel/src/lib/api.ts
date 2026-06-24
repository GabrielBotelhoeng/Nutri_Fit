import { supabase } from './supabase';

// SEC-1: backend agora valida JWT do Supabase Auth (antes era VITE_PANEL_API_KEY
// inlineada no bundle, ou seja, publica). Toda chamada ao backend passa por aqui
// pra anexar o `Authorization: Bearer <access_token>` da sessao atual.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = import.meta.env.VITE_BACKEND_URL as string;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${base}${path}`, { ...init, headers });
}
