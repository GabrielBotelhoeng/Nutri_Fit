---
phase: 05-painel-do-nutricionista
plan: 02
status: DONE
completed_at: 2026-04-26
---

# SUMMARY — 05-02: Backend /api/pacientes + PANEL_API_KEY + fix rag.ts

## O que foi implementado

### backend/src/config/env.ts (atualizado)
- `PANEL_API_KEY: string` adicionado à interface `Env`
- `'PANEL_API_KEY'` adicionado ao array `required`
- `PANEL_API_KEY: process.env.PANEL_API_KEY!` adicionado ao objeto retornado

### backend/src/services/rag.ts (bug fix)
- `STORAGE_PREFIX` corrigido: removido `/public/` — bucket 'dietas' é privado; path correto é `/storage/v1/object/dietas/`

### backend/src/routes/pacientes.ts (novo)
- `requirePanelKey` middleware — compara `x-api-key` com `env.PANEL_API_KEY`, retorna 401 se inválido
- `pacientesRouter.use(requirePanelKey)` — protege TODAS as rotas
- `multer` com `memoryStorage()` e limite de 50MB, fileFilter rejeita não-PDF
- `POST /` — insere paciente, faz upload PDF para Supabase Storage bucket 'dietas', insere dieta, dispara `enviarBoasVindas` (await), retorna 201, inicia `processarDieta` fire-and-forget
- `GET /` — lista pacientes com `calcularStatus()` calculando ativo/expirando/expirado
- `PATCH /:id` — atualiza `ativo` e/ou `data_expiracao`

### backend/src/routes/api.ts (atualizado)
- `import { pacientesRouter } from './pacientes'`
- `apiRouter.use('/pacientes', pacientesRouter)`

### docker-compose.local.yml (atualizado)
- `PANEL_API_KEY: ${PANEL_API_KEY:-nutrichat_panel_key_dev}` adicionado ao serviço backend

### .env (atualizado)
- `PANEL_API_KEY=nutrichat_panel_key_dev` adicionado

### nutrichat-painel/src/App.tsx (fix)
- `import type { Session }` corrigido (TypeScript `verbatimModuleSyntax`)

### multer@2.1.1 instalado no backend (+ @types/multer@2.1.0)

## Verificações passadas

| Verificação | Resultado |
|-------------|-----------|
| `npx tsc --noEmit` no backend | ✅ 0 erros |
| `GET /api/pacientes` sem header | ✅ 401 `{"error":"Unauthorized"}` |
| `GET /api/pacientes` com `X-API-Key: nutrichat_panel_key_dev` | ✅ 200 `[]` |
| `grep object/public/dietas rag.ts` retorna vazio | ✅ Bug corrigido |
| `grep PANEL_API_KEY env.ts` retorna 3 linhas | ✅ |
| `curl /health` | ✅ `{"status":"ok"}` |

## Desvios do plano
- Docker rebuild necessário (`docker compose build backend`) — multer instalado localmente não estava disponível no container, que usa imagem buildada em vez de volume para node_modules
