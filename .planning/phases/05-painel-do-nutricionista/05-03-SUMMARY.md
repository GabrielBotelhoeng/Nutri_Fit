---
phase: 05-painel-do-nutricionista
plan: 03
status: DONE
completed_at: 2026-04-26
---

# SUMMARY — 05-03: Dashboard UI + Dockerfile Caddy

## O que foi implementado

### nutrichat-painel/src/components/StatusBadge.tsx (novo)
- Badge colorido: `bg-green-100` (ativo), `bg-yellow-100` (expirando), `bg-red-100` (expirado)

### nutrichat-painel/src/components/PacienteModal.tsx (novo)
- Modo cadastro: `FormData` com POST multipart para `/api/pacientes` + upload PDF
- Modo edição: PATCH JSON com `ativo` e `data_expiracao`
- Header `X-API-Key` em todos os requests
- Mensagens de sucesso/erro inline; fecha modal após 1,5s de confirmação

### nutrichat-painel/src/pages/Dashboard.tsx (novo)
- Tabela com colunas: Nome, WhatsApp, Plano, Expiração, Status, Editar
- `StatusBadge` integrado para exibir status colorido
- `PacienteModal` abre para novo paciente ou edição
- `carregarPacientes` chamado após `onSaved` para atualizar a lista

### nutrichat-painel/src/App.tsx (atualizado)
- Removido `DashboardPlaceholder`
- `import { Dashboard } from './pages/Dashboard'` substituído no render condicional

### nutrichat-painel/Dockerfile (novo)
- Stage 1: `node:22-alpine` — `npm install` + `npm run build`
- Stage 2: `caddy:2-alpine` — serve `dist/` via Caddyfile

### nutrichat-painel/Caddyfile (novo)
- `try_files {path} /index.html` — SPA routing, sem 404 no refresh
- `auto_https off` — Railway gerencia TLS externamente

### nutrichat-painel/.dockerignore (novo)
- Exclui `node_modules`, `dist`, `.env*`, `*.md`

## Verificações passadas

| Verificação | Resultado |
|-------------|-----------|
| `npm run build` (tsc + vite) | ✅ 0 erros, 61 módulos, 387KB bundle |
| `grep bg-green-100 StatusBadge.tsx` | ✅ |
| `grep FormData PacienteModal.tsx` | ✅ |
| `grep StatusBadge Dashboard.tsx` | ✅ 2 ocorrências |
| `grep "import.*Dashboard" App.tsx` | ✅ |
| `grep try_files Caddyfile` | ✅ |
| `grep caddy:2-alpine Dockerfile` | ✅ |

## Desvios do plano
- Nenhum
