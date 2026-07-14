import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './Button';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro('Email ou senha incorretos.');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg-app)' }}>
      <form
        onSubmit={handleLogin}
        className="bg-white rounded-2xl p-8 w-full max-w-sm"
        style={{ border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span aria-hidden className="text-2xl">🥗</span>
          <span className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            NutriChat
          </span>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Painel do nutricionista
        </p>

        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          required
          autoComplete="email"
          className="w-full border rounded-md px-3 py-2 mb-4 text-sm"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        />

        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Senha
        </label>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
          className="w-full border rounded-md px-3 py-2 mb-4 text-sm"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        />

        {erro && (
          <div
            role="alert"
            className="mb-4 px-3 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
          >
            {erro}
          </div>
        )}

        <Button type="submit" fullWidth loading={loading} disabled={loading}>
          Entrar
        </Button>
      </form>
    </div>
  );
}
