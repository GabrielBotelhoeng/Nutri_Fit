import { defineConfig } from 'vitest/config';

// Agentes de teste: conversas reais (Claude + Supabase LOCAL). Separado da suíte
// unitária — `npm test` continua rápido e de graça; estes rodam com `npm run agentes`.
export default defineConfig({
  test: {
    include: ['agentes-teste/cenarios/**/*.agente.ts'],
    setupFiles: ['./agentes-teste/setup.ts'],
    globalSetup: ['./agentes-teste/global.ts'],
    // Um cenário por vez: conversas longas e limite de taxa da API.
    fileParallelism: false,
    testTimeout: 10 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
});
