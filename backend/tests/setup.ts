// Defining envs antes do import de qualquer modulo do backend: env.ts
// faz process.exit(1) quando alguma variavel obrigatoria falta.
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'test-anon';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? 'test-service';
process.env.EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? 'http://localhost:8081';
process.env.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? 'test-evo';
process.env.EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET ?? 'test-webhook-secret';
process.env.N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? 'http://localhost:5678';
process.env.CLAUDE_API_KEY = process.env.CLAUDE_API_KEY ?? 'sk-ant-test';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'gsk-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'sk-test';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'internal-test';
