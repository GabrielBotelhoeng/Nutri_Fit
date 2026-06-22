import { useState } from 'react';
import { supabase } from '../lib/supabase';

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
    if (error) setErro('Email ou senha incorretos');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-offwhite)' }}>
      <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl font-bold" style={{ color: 'var(--color-terra)' }}>NutriChat</span>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--color-terra)' }}>Painel do Nutricionista</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2"
          style={{ '--tw-ring-color': 'var(--color-floresta)' } as React.CSSProperties}
        />
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          required
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2"
        />
        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded text-white font-semibold disabled:opacity-60 cursor-pointer"
          style={{ background: 'var(--color-floresta)' }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
