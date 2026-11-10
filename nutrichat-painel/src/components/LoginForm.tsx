import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './Button';
import { Logo } from './Logo';

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
    if (error) setErro('E-mail ou senha incorretos.');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <form
        onSubmit={handleLogin}
        className="bg-white/90 rounded-3xl p-6 sm:p-8 w-full max-w-sm"
        style={{ border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--shadow-elevated)' }}
      >
        <div className="mb-6">
          <Logo tamanho="lg" />
        </div>
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--color-floresta)' }}>
          Acesse o painel
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Entre para acompanhar seus pacientes.
        </p>

        <label htmlFor="login-email" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
          E-mail
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          required
          autoComplete="email"
          className="campo mb-4"
        />

        <label htmlFor="login-senha" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Senha
        </label>
        <input
          id="login-senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
          className="campo mb-5"
        />

        {erro && (
          <div
            role="alert"
            className="mb-4 px-3 py-2 rounded-lg text-sm"
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
