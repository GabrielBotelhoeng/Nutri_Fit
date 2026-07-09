# Phase 5: Painel do Nutricionista - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Nutricionista acessa painel web seguro para cadastrar pacientes (nome, WhatsApp, plano, data de expiração, PDF da dieta), disparar boas-vindas automáticas, e gerenciar planos (ativar/desativar, renovar expiração). Lista de pacientes mostra status visual de cada plano.

Esta fase **não** inclui: landing page (Fase 6), métricas/gráficos de evolução de pacientes (v2), multi-nutricionista (out of scope v1).

</domain>

<decisions>
## Implementation Decisions

### Onde o painel vive

- **D-01:** Painel é um **app React + Vite separado**, em repositório próprio `nutrichat-painel`. Deploy no **Railway**. Não compartilha repositório com a landing page (Fase 6 — Next.js no Vercel).
- **D-02:** Em desenvolvimento local, Vite roda na **porta 5173**. Backend continua na porta 3001.
- **D-03:** Estrutura de 3 repositórios:
  - `nutrichat-backend` → Railway (já existe)
  - `nutrichat-painel` → Railway (novo — esta fase)
  - `nutrichat-landing` → Vercel (Fase 6)

### Design do Painel

- **D-04:** **Tailwind CSS** com a paleta do NutriChat. Visual funcional mas apresentável no portfólio:
  - Header: fundo verde floresta `#2D5016`, logo NutriChat
  - Background: verde off-white `#F0F7EC`
  - Badges de status: verde (ativo), amarelo/laranja (expirando em breve), vermelho (expirado)
  - Tipografia: marrom terra `#6B3D1E`
- **D-05:** **Single Page Application** — sem roteamento complexo. Uma página principal após login: lista de pacientes com botão "Novo Paciente" que abre modal/drawer. Cadastro e edição na mesma página.
- **D-06:** Sem component library externa (shadcn, Radix) — Tailwind puro para manter a fase simples e rápida.

### Fluxo de Cadastro de Paciente

- **D-07:** **Todo o cadastro passa pelo backend** — Frontend faz `POST /api/pacientes` com `multipart/form-data` (dados + PDF). Backend é responsável por:
  1. Salvar registro na tabela `pacientes` (Supabase)
  2. Fazer upload do PDF no Supabase Storage
  3. Disparar boas-vindas via Evolution API
  4. Iniciar processamento RAG em background (fire-and-forget)
  5. Retornar `{ sucesso: true }` imediatamente
- **D-08:** Processamento RAG é **assíncrono** (fire-and-forget). Backend retorna após salvar e disparar boas-vindas — não espera o RAG completar. Frontend exibe: *"Paciente cadastrado — dieta sendo processada..."*
- **D-09:** Rota nova no backend: `POST /api/pacientes` (cadastro), `PATCH /api/pacientes/:id` (atualizar plano/expiração/status), `GET /api/pacientes` (listar com status calculado).

### Autenticação

- **D-10:** **Supabase Auth SDK direto no client** (`@supabase/supabase-js`). Frontend faz login com email/senha, JWT fica no localStorage (Supabase gerencia automaticamente). Sem cadastro público — apenas usuários criados manualmente no Supabase Auth conseguem entrar (AUTH-03).
- **D-11:** Proteção de rota via **React guard**: componente `<ProtectedRoute>` verifica sessão Supabase; redireciona para `/login` se não autenticado. Sessão persiste entre visitas via refresh token do Supabase (AUTH-02).
- **D-12:** Chamadas do frontend ao backend autorizadas via **API Key compartilhada** — header `X-API-Key` com chave secreta (env var `PANEL_API_KEY`). Backend verifica antes de processar qualquer rota `/api/pacientes`. Simples e suficiente para uso internal single-tenant.

### Claude's Discretion

- Estrutura de pastas do projeto React+Vite (ex: `src/components/`, `src/pages/`, `src/lib/`)
- Gestão de estado local (useState/useEffect ou Context simples — sem Redux/Zustand)
- Formato exato do modal/drawer de cadastro (layout dos campos)
- Validações client-side dos formulários (HTML5 nativo ou react-hook-form leve)
- Estratégia de status no campo `status` calculado: backend calcula ou frontend calcula com base em `data_expiracao`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da Fase 5
- `.planning/REQUIREMENTS.md` §AUTH — AUTH-01, AUTH-02, AUTH-03 (3 requisitos de autenticação)
- `.planning/REQUIREMENTS.md` §PANEL — PANEL-01 a PANEL-06 (6 requisitos do painel)
- `.planning/ROADMAP.md` §Phase 5 — Goal, Success Criteria e Plans desta fase

### Projeto
- `.planning/PROJECT.md` — Stack, paleta de cores, decisões de arquitetura, planos (preços R$330/R$222/R$130/R$89,90)

### Código existente a estender
- `backend/src/routes/boas-vindas.ts` — rota de boas-vindas já existente; fluxo de cadastro deve chamá-la internamente
- `backend/src/services/rag.ts` — `processarDieta()` para iniciar RAG em background no cadastro
- `backend/src/services/evolution.ts` — `sendText()` para envio de mensagens
- `backend/src/routes/api.ts` — ponto de registro de novas rotas (`/api/pacientes`)

### Schema existente
- `supabase/migrations/20260422000001_create_schema.sql` — tabela `pacientes` (id, nome, whatsapp, status, entrevista_dados, created_at) e `dietas` (paciente_id, pdf_url, status)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `evolution.ts` → `sendText()`: envio de mensagens WhatsApp — reutilizar no fluxo de boas-vindas do cadastro
- `rag.ts` → `processarDieta(pacienteId, pdfUrl)`: processar PDF em background após upload
- Padrão fire-and-forget já estabelecido: `processarDieta()` chamada sem await após retornar 200/201

### Established Patterns
- Fire-and-forget para operações longas (processamento RAG, alertas)
- Supabase service key apenas no servidor — nunca exposta ao frontend
- TypeScript em todo o backend — novo código no `nutrichat-painel` usa TypeScript também

### Integration Points
- `POST /api/pacientes` (novo) → salva paciente → upload Storage → boas-vindas → RAG background
- `GET /api/pacientes` (novo) → lista com status calculado (ativo / expirando em breve / expirado)
- `PATCH /api/pacientes/:id` (novo) → atualiza `ativo`, `data_expiracao`, `plano`
- Frontend envia header `X-API-Key` em todas as chamadas → backend verifica middleware

</code_context>

<specifics>
## Specific Ideas

- Badges de status com lógica clara:
  - **✅ Ativo**: `data_expiracao > hoje + 3 dias` e `ativo = true`
  - **⚠️ Expirando**: `data_expiracao` entre hoje e `hoje + 3 dias`
  - **❌ Expirado**: `data_expiracao < hoje` ou `ativo = false`
- Campo `plano` na tabela `pacientes` deve armazenar a duração em meses (1, 3, 6, 12) para referência
- Modal de cadastro deve ter campo de upload de PDF com preview do nome do arquivo
- Mensagem de feedback ao usuário após cadastro: *"✅ Gabriel cadastrado — dieta sendo processada em segundo plano."*

</specifics>

<deferred>
## Deferred Ideas

- Dashboard com métricas e gráficos de evolução do paciente — v2 (mencionado no REQUIREMENTS.md)
- Sidebar de navegação — sem necessidade para single-page app desta fase
- Edição inline na tabela (sem modal) — Claude decide a abordagem, edição modal é suficiente

</deferred>

---

*Phase: 05-painel-do-nutricionista*
*Context gathered: 2026-04-26*
