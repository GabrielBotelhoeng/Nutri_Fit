# NutriChat — Painel do Nutricionista

Painel web onde o(a) nutricionista cadastra pacientes, envia o PDF da dieta
e acompanha adesão. É a **única interface humana** do projeto — todo o
resto acontece no WhatsApp entre paciente e agente.

**Live:** <https://nutrichat-painel.vercel.app>

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | React 19 + Vite 6 + TypeScript |
| Estilo | Tailwind v4 |
| Backend | Supabase (auth + Postgres direto) + backend NutriChat (upload/RAG) |
| Deploy | Vercel (auto-deploy do branch `main`) |

## Setup local

```bash
# 1. Copie o exemplo e preencha
cp .env.example .env.local
# edite .env.local

# 2. Instale
npm install

# 3. Rode em dev
npm run dev
# abre http://localhost:5173
```

## Variáveis de ambiente

Todas prefixadas com `VITE_` (Vite só expõe essas ao bundle).

| Var | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase (auth + listagem de pacientes) |
| `VITE_SUPABASE_ANON_KEY` | Chave pública do Supabase (RLS ativa) |
| `VITE_BACKEND_URL` | URL do backend NutriChat (`https://nutrichat-backend.fly.dev` em prod) — usado para upload de PDF, indexação RAG e cadastro de paciente |

## Build de produção

```bash
npm run build   # tsc -b && vite build → dist/
npm run preview # serve dist/ localmente
```

O `Dockerfile` + `Caddyfile` servem `dist/` estático via Caddy caso queira
subir num container em vez da Vercel.

## Deploy (Vercel)

Push em `main` dispara build e deploy automático.

- Env vars: **Vercel → Project → Settings → Environment Variables**
- Alias curto: `nutrichat-painel.vercel.app`
- **Importante:** a URL do painel precisa estar em `CORS_ORIGIN` do backend
  (Fly) — se não, o browser bloqueia as chamadas com "Failed to fetch".
  Whitelist atual: alias curto + deploy longo + `localhost:5173`.

## Estrutura

```
src/
  App.tsx           # Router + guard de sessão
  main.tsx          # Entry
  pages/            # Login, ListaPacientes, DetalhePaciente, ...
  components/       # Cards, forms, tabelas
  lib/
    supabase.ts     # Cliente Supabase (auth + queries diretas)
    api.ts          # Wrapper de fetch para o backend NutriChat
  index.css         # Tailwind v4 setup
public/             # Assets estáticos servidos como estão
```

## Autenticação

Login via Supabase Auth (email + senha). Todas as queries diretas ao
Postgres respeitam RLS — só o próprio nutricionista lê seus pacientes.

Uploads e ações administrativas passam pelo backend NutriChat com o
token do Supabase no header `Authorization: Bearer <token>`.
