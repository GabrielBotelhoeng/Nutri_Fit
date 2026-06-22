---
phase: 1
plan: "01-02"
subsystem: backend
tags: [express, typescript, docker, railway, infra]
dependency_graph:
  requires: []
  provides: [backend-express, docker-compose-local, railway-deploy-config]
  affects: [01-03, fases-seguintes]
tech_stack:
  added:
    - express@4.22.1
    - "@supabase/supabase-js@2.104.0"
    - tsx@4.21.0
    - typescript@5.9.3
    - cors@2.8.5
    - dotenv@16.4.1
  patterns:
    - Express Router modular (src/routes/)
    - Validacao de env na inicializacao (validateEnv com process.exit)
    - Graceful shutdown via SIGTERM
    - Docker multi-service com healthcheck e depends_on condition
key_files:
  created:
    - backend/package.json
    - backend/tsconfig.json
    - backend/src/index.ts
    - backend/src/routes/health.ts
    - backend/src/config/env.ts
    - backend/.env.example
    - backend/.gitignore
    - backend/Dockerfile.dev
    - backend/railway.toml
    - backend/Procfile
    - docker-compose.local.yml
    - .env.example
    - .gitignore
  modified: []
decisions:
  - "validateEnv chama process.exit(1) se qualquer variavel obrigatoria estiver ausente — falha rapida, segura"
  - "Docker Compose local define evolution-api diretamente (sem extends/include do evolution-api/docker-compose.yaml)"
  - "docker compose config validado com --env-file .env.example (root .env tem formato invalido — notas em texto livre)"
  - "Deploy no Railway e passo manual documentado — requer railway login interativo"
metrics:
  duration: "~8 minutos"
  completed: "2026-04-23T03:03:42Z"
  tasks_completed: 3
  files_created: 13
---

# Phase 1 Plan 02: Backend Node.js/Express + Docker Compose local + Railway deploy Summary

**One-liner:** Backend Express/TypeScript com /health, Docker Compose de 5 servicos com pgvector, e artefatos de deploy Railway configurados.

---

## O que foi construido

### Estrutura de pastas criada em backend/

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts          # Validacao de env vars na inicializacao
│   ├── middleware/         # (reservado para fases seguintes)
│   ├── routes/
│   │   └── health.ts       # GET /health → {status: ok, version: 1.0.0}
│   └── index.ts            # Entry point Express com graceful shutdown
├── .env.example            # Documentacao de todas as variaveis
├── .gitignore              # Protege .env e node_modules
├── Dockerfile.dev          # Docker dev (node:20-alpine + tsx watch)
├── Procfile                # web: npm run start (Railway)
├── package.json            # Scripts: dev, build, start, typecheck
├── railway.toml            # Build NIXPACKS + healthcheckPath /health
└── tsconfig.json           # strict: true, ES2022, outDir ./dist
```

### Versoes instaladas das dependencias principais

| Pacote | Versao |
|--------|--------|
| express | 4.22.1 |
| @supabase/supabase-js | 2.104.0 |
| cors | 2.8.5 |
| dotenv | 16.4.1 |
| tsx | 4.21.0 |
| typescript | 5.9.3 |

---

## Como usar

### Desenvolvimento local (sem Docker)

```bash
cd backend
cp .env.example .env
# Preencher .env com valores reais
npm run dev
# Servidor em http://localhost:3001
curl http://localhost:3001/health
# {"status":"ok","version":"1.0.0","service":"nutrichat-backend","timestamp":"..."}
```

### Desenvolvimento local (com Docker Compose)

```bash
cp .env.example .env
# Preencher .env com SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, CLAUDE_API_KEY, GROQ_API_KEY
docker compose -f docker-compose.local.yml up -d
# Servicos disponiveis:
# - Backend: http://localhost:3001
# - Evolution API: http://localhost:8080
# - N8N: http://localhost:5678 (admin / nutrichat123)
# - Postgres: localhost:5432 (postgres/postgres)
# - Redis: localhost:6379
```

### Verificar typecheck

```bash
cd backend && npm run typecheck
# Saida vazia = sem erros TypeScript
```

---

## Deploy no Railway (Passo Manual — INFRA-06)

Os artefatos de deploy foram criados (`railway.toml`, `Procfile`). O deploy em si requer autenticacao interativa:

**Opcao A — Railway CLI:**
```bash
cd backend
railway login        # abre navegador para autenticacao
railway init         # criar/linkar projeto no Railway
railway up           # primeiro deploy
```

**Opcao B — Railway Dashboard (recomendado para primeiro deploy):**
1. Acesse https://railway.app e faca login
2. New Project > Deploy from GitHub repo
3. Selecione o repositorio e defina Root Directory como `backend/`
4. Railway detecta automaticamente o `railway.toml`

**Configurar variaveis de ambiente no Railway (Settings > Variables):**
```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=<valor>
SUPABASE_SERVICE_KEY=<valor>
EVOLUTION_API_URL=<url-railway-evolution>
EVOLUTION_API_KEY=<valor>
N8N_WEBHOOK_URL=<url-railway-n8n>
CLAUDE_API_KEY=<valor>
GROQ_API_KEY=<valor>
NODE_ENV=production
```

**Verificar apos deploy:**
```bash
curl https://<railway-url>/health
# Esperado: HTTP 200 {"status":"ok","version":"1.0.0",...}
```

**URL do Railway:** Pendente — sera gerada apos o deploy manual e deve ser registrada aqui para uso pelos planos seguintes (01-03 Evolution API e N8N apontarao para ela).

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Root .env com formato invalido bloqueava docker compose config**
- **Found during:** Task 2 — verificacao de sintaxe
- **Issue:** `docker compose -f docker-compose.local.yml config` falhou com "key cannot contain a space" porque o arquivo `.env` na raiz continha notas em texto livre (nao formato KEY=VALUE)
- **Fix:** Executei a validacao com `--env-file .env.example` que tem formato valido, confirmando que o `docker-compose.local.yml` esta correto. O `.env` raiz com notas nao faz parte do escopo deste plano.
- **Files modified:** Nenhum
- **Commit:** (sem commit adicional — apenas mudanca no comando de validacao)

---

## Known Stubs

Nenhum stub — backend/src/config/env.ts valida variaveis reais, saidas da rota /health sao valores reais (timestamp, version, status). Nenhum hardcode de dados de exemplo.

---

## Threat Surface

Verificado conforme threat_model do plano:

- T-02-01: `.gitignore` raiz e `backend/.gitignore` incluem `.env` — MITIGADO
- T-02-02: `validateEnv` loga apenas o nome da variavel ausente, nunca o valor — MITIGADO
- T-02-03: `/health` sem acesso ao banco, risco aceito — ACEITO
- T-02-04: `express.json({ limit: '10mb' })` configurado — MITIGADO
- T-02-05: `railway.toml` sem valores de segredos — MITIGADO

---

## Self-Check: PASSED

Todos os arquivos criados verificados:
- FOUND: backend/package.json
- FOUND: backend/tsconfig.json
- FOUND: backend/src/index.ts
- FOUND: backend/src/routes/health.ts
- FOUND: backend/src/config/env.ts
- FOUND: backend/.env.example
- FOUND: backend/.gitignore
- FOUND: backend/Dockerfile.dev
- FOUND: backend/railway.toml
- FOUND: backend/Procfile
- FOUND: docker-compose.local.yml
- FOUND: .env.example
- FOUND: .gitignore
- FOUND: backend/node_modules/

Commits verificados:
- 471f488: feat(01-02): scaffold backend TypeScript com rota /health
- 1041936: feat(01-02): Docker Compose local com 5 servicos para desenvolvimento offline
- 75a3163: feat(01-02): artefatos de deploy Railway para o backend (INFRA-06)
