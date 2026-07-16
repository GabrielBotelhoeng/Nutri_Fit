import 'dotenv/config';

interface Env {
  PORT: number;
  NODE_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  EVOLUTION_API_URL: string;
  EVOLUTION_API_KEY: string;
  EVOLUTION_WEBHOOK_SECRET: string;
  N8N_WEBHOOK_URL: string;
  CLAUDE_API_KEY: string;
  GROQ_API_KEY: string;
  OPENAI_API_KEY: string;
  INTERNAL_API_KEY: string;
  // Lista separada por virgula das origens permitidas do painel.
  // Vazio (dev) => allow-all. Em prod SEMPRE preencher.
  CORS_ORIGIN: string;
}

function validateEnv(): Env {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_KEY',
    'EVOLUTION_API_URL',
    'EVOLUTION_API_KEY',
    'EVOLUTION_WEBHOOK_SECRET',
    'N8N_WEBHOOK_URL',
    'CLAUDE_API_KEY',
    'GROQ_API_KEY',
    'OPENAI_API_KEY',
    'INTERNAL_API_KEY',
  ] as const;

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('[env] Variaveis de ambiente ausentes:', missing.join(', '));
    process.exit(1);
  }

  return {
    PORT: parseInt(process.env.PORT ?? '3001', 10),
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY!,
    EVOLUTION_API_URL: process.env.EVOLUTION_API_URL!,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY!,
    EVOLUTION_WEBHOOK_SECRET: process.env.EVOLUTION_WEBHOOK_SECRET!,
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL!,
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY!,
    GROQ_API_KEY: process.env.GROQ_API_KEY!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY!,
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? '',
  };
}

export const env = validateEnv();
