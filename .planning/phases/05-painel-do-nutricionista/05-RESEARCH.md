# Phase 5: Painel do Nutricionista - Research

**Researched:** 2026-04-26
**Domain:** React SPA + Supabase Auth + Express multipart upload + Railway deploy
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Painel é um **app React + Vite separado**, em repositório próprio `nutrichat-painel`. Deploy no **Railway**. Não compartilha repositório com landing page.
- **D-02:** Em dev local, Vite roda na **porta 5173**. Backend continua na porta 3001.
- **D-03:** Estrutura de 3 repositórios: `nutrichat-backend` (Railway), `nutrichat-painel` (Railway), `nutrichat-landing` (Vercel — Fase 6).
- **D-04:** **Tailwind CSS** com paleta NutriChat. Verde floresta `#2D5016` no header, `#F0F7EC` no background, marrom terra `#6B3D1E` na tipografia. Badges: verde (ativo), amarelo/laranja (expirando), vermelho (expirado).
- **D-05:** **Single Page Application** sem roteamento complexo. Uma página principal com lista de pacientes + botão "Novo Paciente" abrindo modal.
- **D-06:** Sem component library externa. Tailwind puro.
- **D-07:** **Todo cadastro passa pelo backend** via `POST /api/pacientes` com `multipart/form-data`. Backend responsável por salvar, upload Storage, disparar boas-vindas, iniciar RAG.
- **D-08:** RAG é **fire-and-forget**. Backend retorna após salvar + boas-vindas. Frontend exibe: *"Paciente cadastrado — dieta sendo processada..."*
- **D-09:** 3 novas rotas: `POST /api/pacientes`, `GET /api/pacientes`, `PATCH /api/pacientes/:id`.
- **D-10:** **Supabase Auth SDK direto no client** (`@supabase/supabase-js`). Login email/senha. JWT no localStorage. Sem cadastro público (AUTH-03).
- **D-11:** Proteção via `<ProtectedRoute>` React. Redireciona para `/login` se não autenticado. Sessão persiste via refresh token do Supabase.
- **D-12:** Chamadas frontend → backend via **`X-API-Key`** header com chave secreta (`PANEL_API_KEY`). Backend verifica antes de processar qualquer rota `/api/pacientes`.

### Claude's Discretion

- Estrutura de pastas do projeto React + Vite (`src/components/`, `src/pages/`, `src/lib/`)
- Gestão de estado local (useState/useEffect ou Context simples — sem Redux/Zustand)
- Formato exato do modal/drawer de cadastro (layout dos campos)
- Validações client-side dos formulários (HTML5 nativo ou react-hook-form leve)
- Estratégia de status calculado: backend calcula ou frontend calcula com base em `data_expiracao`

### Deferred Ideas (OUT OF SCOPE)

- Dashboard com métricas e gráficos de evolução do paciente (v2)
- Sidebar de navegação
- Edição inline na tabela (modal é suficiente)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Nutricionista faz login no painel com email/senha via Supabase Auth | Supabase `signInWithPassword` pattern verificado |
| AUTH-02 | Sessão persiste entre visitas (token renovado automaticamente) | `onAuthStateChange` + `persistSession: true` + refresh token automático |
| AUTH-03 | Painel sem cadastro público — acesso restrito a usuários criados manualmente | Apenas `signInWithPassword`, sem `signUp` exposto |
| PANEL-01 | Cadastra paciente com nome, WhatsApp, plano (1/3/6/12 meses), data de expiração | Schema já tem todas as colunas — `plano` e `data_expiracao` presentes |
| PANEL-02 | Upload PDF no Supabase Storage + inicia RAG | `supabase.storage.from('dietas').upload()` via multer buffer; `processarDieta()` já existe |
| PANEL-03 | Disparo automático de boas-vindas no WhatsApp ao salvar paciente | `enviarBoasVindas()` via `agent.ts` — reutilizar lógica existente |
| PANEL-04 | Lista de pacientes com status: ativo, expirando em breve, expirado | Lógica de badge calculada no backend via `GET /api/pacientes` |
| PANEL-05 | Ativar/desativar acesso do paciente manualmente | `PATCH /api/pacientes/:id` com campo `ativo` |
| PANEL-06 | Atualizar data de expiração de um plano (renovação manual) | `PATCH /api/pacientes/:id` com campo `data_expiracao` |
</phase_requirements>

---

## Summary

A Fase 5 envolve dois artefatos distintos: (1) o app React + Vite `nutrichat-painel` (novo repositório) e (2) três novas rotas no backend Express existente. O frontend autentica diretamente com Supabase Auth via SDK client-side, persiste sessão no localStorage, e protege a página principal com um `<ProtectedRoute>`. As chamadas ao backend usam um header `X-API-Key` simples.

No backend, as três novas rotas precisam de: middleware de autenticação por API Key, multer para aceitar `multipart/form-data` com o arquivo PDF em memória, upload para Supabase Storage com a service key, insert na tabela `pacientes`, insert na tabela `dietas`, disparo de boas-vindas e fire-and-forget para o RAG. A tabela `pacientes` já tem todas as colunas necessárias (`ativo`, `data_expiracao`, `plano`), confirmado na migration `20260422000001_create_schema.sql`.

O deploy do painel no Railway usa um Dockerfile multi-stage: Node constrói o `dist`, Caddy serve o `dist` com fallback para `index.html` (SPA routing). O Tailwind v4 usa o plugin `@tailwindcss/vite` — não requer `tailwind.config.js`.

**Primary recommendation:** Dividir em 3 planos: (05-01) auth + scaffold do painel, (05-02) backend POST/GET/PATCH pacientes + multer + Storage, (05-03) UI completa + deploy Railway com Dockerfile + Caddy.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Autenticação (login/logout) | Frontend (Browser SPA) | — | SDK Supabase Auth roda no client; JWT fica no localStorage gerenciado pelo SDK |
| Proteção de rota | Frontend (Browser SPA) | — | `<ProtectedRoute>` verifica sessão antes de renderizar; redirects client-side |
| Upload de PDF | Frontend envia → API Backend recebe | — | Frontend monta FormData; backend (multer) recebe, valida, repassa para Storage |
| Persistência de paciente | API / Backend (Express) | Supabase DB | Backend usa service key para inserir em `pacientes` e `dietas` sem RLS |
| Upload para Supabase Storage | API / Backend (Express) | Supabase Storage | Service key bypassa RLS do bucket `dietas`; nunca exposta ao frontend |
| Disparo de boas-vindas WhatsApp | API / Backend (Express) | Evolution API | Reutiliza `enviarBoasVindas()` do `agent.ts` existente |
| RAG background | API / Backend (Express) | Supabase DB + OpenAI | `processarDieta()` fire-and-forget após retornar 201 |
| Listagem + status calculado | API / Backend (Express) | — | Backend calcula ativo/expirando/expirado antes de retornar — frontend só renderiza badge |
| Ativar/desativar + renovação | API / Backend (Express) | Supabase DB | PATCH simples com service key |
| Deploy SPA | CDN / Static (Caddy no Railway) | — | Dockerfile multi-stage: build Node → serve Caddy com SPA fallback |

---

## Standard Stack

### Repositório `nutrichat-painel` (novo)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 8.0.10 | Build tool + dev server | Scaffold padrão React TS (`npm create vite@latest`) |
| react | 19.2.5 | UI library | Projeto já usa React no ecossistema |
| react-dom | 19.2.5 | DOM renderer | Paired com React |
| @types/react | 19.2.14 | TypeScript types | Dev dependency obrigatório |
| typescript | ~5.3 | Type safety | Projeto inteiro em TS |
| tailwindcss | 4.2.4 | Utility CSS | Decisão D-06 — sem component library |
| @tailwindcss/vite | 4.2.4 | Plugin Vite para Tailwind v4 | Substitui PostCSS config em v4 |
| @supabase/supabase-js | 2.104.1 | Auth + DB client | Mesmo pacote já no backend; versão verificada |

> Versões verificadas via `npm view` em 2026-04-26. [VERIFIED: npm registry]

### Rotas novas no `nutrichat-backend` (existente)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| multer | 2.1.1 | Middleware multipart/form-data | Padrão para upload de arquivo no Express |
| @types/multer | 2.1.0 | TypeScript types | Dev dependency para multer |

> Versões verificadas via `npm view` em 2026-04-26. [VERIFIED: npm registry]

### Deploy (Caddy — sem instalar pacote npm)

Caddyfile + Dockerfile no repositório do painel. Sem dependência npm adicional.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Caddy + Dockerfile | Serve (npm) | Caddy é zero-config para SPA routing; `serve` requer config extra para fallback |
| multer memoryStorage | multer diskStorage | diskStorage salva em disco do container Railway (efêmero); memoryStorage passa o Buffer direto para Supabase Storage |
| Tailwind v4 plugin | Tailwind v3 + PostCSS | v4 já é estável (lançado 2025); configuração mais simples — sem `content` array |

### Installation

**Painel (nutrichat-painel):**
```bash
npm create vite@latest nutrichat-painel -- --template react-ts
cd nutrichat-painel
npm install @supabase/supabase-js
npm install tailwindcss @tailwindcss/vite
```

**Backend (adicionar ao backend existente):**
```bash
npm install multer
npm install --save-dev @types/multer
```

---

## Architecture Patterns

### System Architecture Diagram

```
[Nutricionista — Browser]
        |
        | VITE_SUPABASE_ANON_KEY (env var build-time)
        v
[React SPA — nutrichat-painel]
  1. supabase.auth.signInWithPassword()
  2. onAuthStateChange → session state
  3. <ProtectedRoute> guarda página principal
        |
        | X-API-Key: PANEL_API_KEY (header)
        | multipart/form-data (cadastro) ou JSON (PATCH/GET)
        v
[Express Backend — nutrichat-backend :3001]
  Middleware: requirePanelKey (X-API-Key validation)
  Routes: /api/pacientes
        |
    POST /api/pacientes (multer memoryStorage)
        ├──► INSERT pacientes (service key → RLS bypass)
        ├──► supabase.storage.from('dietas').upload(buffer)
        ├──► INSERT dietas (pdf_url, status='ativa')
        ├──► enviarBoasVindas(pacienteId) — await
        ├──► res.status(201).json({ sucesso: true })
        └──► processarDieta(pacienteId, dietaId, pdfUrl) — fire-and-forget
        |
    GET /api/pacientes
        └──► SELECT pacientes + calcular status → retorna lista com badge
        |
    PATCH /api/pacientes/:id
        └──► UPDATE pacientes SET ativo | data_expiracao
        |
        v
[Supabase Cloud]
  ├── DB: tabela pacientes (ativo, data_expiracao, plano — já existem)
  ├── DB: tabela dietas
  └── Storage: bucket 'dietas' (PDF upload via service key)
        |
        v (fire-and-forget após 201)
[RAG Pipeline — processarDieta()]
  OpenAI embeddings → dieta_chunks
```

### Recommended Project Structure (nutrichat-painel)

```
nutrichat-painel/
├── src/
│   ├── lib/
│   │   └── supabase.ts      # createClient com anon key
│   ├── components/
│   │   ├── ProtectedRoute.tsx
│   │   ├── LoginForm.tsx
│   │   ├── PacienteModal.tsx
│   │   └── StatusBadge.tsx
│   ├── pages/
│   │   └── Dashboard.tsx    # lista de pacientes
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css            # @import "tailwindcss";
├── Caddyfile
├── Dockerfile
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Pattern 1: Supabase Auth SPA (onAuthStateChange)

**What:** Inicializar sessão com `getSession()` + manter reativo com `onAuthStateChange`.
**When to use:** App.tsx — lógica central de auth.

```typescript
// Source: https://supabase.com/docs/guides/auth/quickstarts/react
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
    },
  }
);

// App.tsx
import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Carrega sessão inicial (persiste após reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Mantém reativo a login/logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div>Carregando...</div>;
  return session ? <Dashboard /> : <LoginForm />;
}
```

### Pattern 2: ProtectedRoute Component

**What:** Componente wrapper que redireciona para login se não há sessão.
**When to use:** Como wrapper da página principal.

```typescript
// src/components/ProtectedRoute.tsx
// [ASSUMED] — padrão React com Supabase, não verificado em docs oficiais
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<unknown>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  if (session === undefined) return null; // loading
  if (!session) {
    // Sem React Router — redireciona diretamente (SPA sem roteamento complexo — D-05)
    window.location.href = '/';
    return null;
  }
  return <>{children}</>;
}
```

> Nota: D-05 define SPA sem roteamento complexo. A lógica de "página" pode ser controlada por estado (`currentPage`) em vez de React Router. Nesse caso, `ProtectedRoute` verifica sessão antes de renderizar o Dashboard e renderiza LoginForm se não há sessão.

### Pattern 3: Multipart Upload — Frontend para Backend

**What:** FormData com campos texto + arquivo, enviado com `fetch` + header `X-API-Key`.
**When to use:** PacienteModal.tsx — submit do formulário de cadastro.

```typescript
// src/components/PacienteModal.tsx (trecho relevante)
// [ASSUMED] — padrão nativo fetch com FormData
async function cadastrarPaciente(dados: {
  nome: string;
  whatsapp: string;
  plano: string;
  data_expiracao: string;
  pdf: File;
}) {
  const form = new FormData();
  form.append('nome', dados.nome);
  form.append('whatsapp', dados.whatsapp);
  form.append('plano', dados.plano);
  form.append('data_expiracao', dados.data_expiracao);
  form.append('dieta', dados.pdf);  // fieldname deve coincidir com multer

  const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/pacientes`, {
    method: 'POST',
    headers: {
      'X-API-Key': import.meta.env.VITE_PANEL_API_KEY,
      // NÃO setar Content-Type — fetch define boundary do multipart automaticamente
    },
    body: form,
  });

  if (!res.ok) throw new Error('Falha ao cadastrar paciente');
  return res.json();
}
```

### Pattern 4: Backend — multer + Supabase Storage upload

**What:** Middleware multer memoryStorage recebe arquivo; backend faz upload para Supabase Storage via service key.
**When to use:** `POST /api/pacientes` route handler.

```typescript
// backend/src/routes/pacientes.ts
// Source: https://expressjs.com/en/resources/middleware/multer.html
//         https://supabase.com/docs/reference/javascript/storage-from-upload
import multer from 'multer';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB — mesmo limite do bucket
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Apenas PDF permitido'));
      return;
    }
    cb(null, true);
  },
});

// Upload para Supabase Storage (service key — bypassa RLS do bucket)
const storagePath = `${pacienteId}/${Date.now()}.pdf`;
const { error: uploadError } = await supabase.storage
  .from('dietas')
  .upload(storagePath, req.file.buffer, {
    contentType: 'application/pdf',
    upsert: false,
  });

const pdfUrl = `${env.SUPABASE_URL}/storage/v1/object/dietas/${storagePath}`;
// Nota: bucket NÃO é público — pdfUrl é path interno; download via service key
// Compatível com como rag.ts baixa o PDF (usa supabase.storage.from('dietas').download(path))
```

### Pattern 5: Backend — Middleware X-API-Key

**What:** Middleware simples que rejeita requisições sem a chave correta.
**When to use:** Registrar antes de todas as rotas `/api/pacientes`.

```typescript
// backend/src/routes/pacientes.ts
// [ASSUMED] — padrão middleware Express; consistente com requireInternalKey já existente
import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const pacientesRouter = Router();

function requirePanelKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-api-key'] !== env.PANEL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

pacientesRouter.use(requirePanelKey);
// ... rotas abaixo
```

> Padrão idêntico ao `requireInternalKey` já usado em `boas-vindas.ts` e `alertas.ts`. [VERIFIED: codebase]

### Pattern 6: Status badge — calcular no backend

**What:** Backend computa o status antes de retornar a lista.
**When to use:** `GET /api/pacientes` — antes de serializar a resposta.

```typescript
// backend/src/routes/pacientes.ts (GET handler)
// [ASSUMED] — lógica de datas; thresholds definidos em CONTEXT.md Specifics
const hoje = new Date();
const tresD = new Date(hoje);
tresD.setDate(tresD.getDate() + 3);

function calcularStatus(p: { ativo: boolean; data_expiracao: string }): 'ativo' | 'expirando' | 'expirado' {
  if (!p.ativo) return 'expirado';
  const exp = new Date(p.data_expiracao);
  if (exp < hoje) return 'expirado';
  if (exp <= tresD) return 'expirando';
  return 'ativo';
}
```

> Thresholds exatos definidos no CONTEXT.md (§Specifics): `expirando` = `data_expiracao` entre hoje e `hoje + 3 dias`; `expirado` = `data_expiracao < hoje` OU `ativo = false`.

### Pattern 7: Tailwind v4 Setup (vite.config.ts + CSS)

**What:** v4 usa plugin Vite, não PostCSS. Sem `tailwind.config.js`.
**When to use:** Setup inicial do `nutrichat-painel`.

```typescript
// vite.config.ts
// Source: https://tailwindcss.com/docs/installation/using-vite
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

```css
/* src/index.css */
@import "tailwindcss";

/* Tema NutriChat — customização via @theme em v4 */
@theme {
  --color-floresta: #2D5016;
  --color-offwhite: #F0F7EC;
  --color-terra: #6B3D1E;
}
```

### Pattern 8: Dockerfile + Caddyfile (deploy Railway)

**What:** Multi-stage build: Node compila Vite dist; Caddy serve com SPA fallback.
**When to use:** Raiz do repositório `nutrichat-painel`.

```dockerfile
# Dockerfile
# Source: https://docs.railway.com/guides/spa-routing-configuration
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist ./dist
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
```

```
# Caddyfile
# Source: https://docs.railway.com/guides/spa-routing-configuration
:80 {
    root * dist
    file_server
    try_files {path} /index.html
    encode gzip
    auto_https off
    trusted_proxies static private_ranges 100.0.0.0/8
}
```

### Anti-Patterns to Avoid

- **`express.json()` antes do multer no mesmo router:** multer trata o body como stream; se `express.json()` consumir o stream primeiro, multer não recebe o arquivo. Multer deve ser o primeiro middleware nas rotas de upload.
- **Expor `SUPABASE_SERVICE_KEY` no frontend:** A service key bypassa RLS. Nunca colocá-la em variável `VITE_*`. O frontend usa apenas `SUPABASE_ANON_KEY` para auth.
- **`Content-Type: multipart/form-data` manual no fetch:** O `boundary` é gerado pelo browser automaticamente quando o body é `FormData`. Setar o header manualmente destrói o boundary e multer rejeita o request.
- **Aguardar `processarDieta()` antes de responder 201:** RAG pode levar 30-60s. O backend deve retornar 201 imediatamente e executar o RAG em background (padrão já estabelecido em D-08).
- **Usar `multer.diskStorage()` no Railway:** O filesystem do container Railway é efêmero. Arquivos em disco são perdidos no próximo deploy. Usar sempre `memoryStorage()` e passar o buffer diretamente para Supabase Storage.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse de multipart/form-data | Parser manual de stream | `multer` | Boundary handling, content-type check, file size limit — complexo |
| Auth session persistence | Gerenciar JWT manual no localStorage | `@supabase/supabase-js` SDK | Auto-refresh de token, onAuthStateChange, storage abstraction |
| Servir SPA com fallback | Express static + rewrite | Caddy com `try_files` | Caddy zero-config para SPA; Express seria mais uma dependência no painel |
| Status badge logic | String comparison de datas no frontend | Calcular no backend `GET /api/pacientes` | Centraliza a lógica; frontend recebe `status` pronto; evita drift entre clientes |

---

## Schema Analysis — Gaps e Campos Necessários

### Confirmado na migration `20260422000001_create_schema.sql` [VERIFIED: codebase]

A tabela `pacientes` já tem **todas as colunas necessárias** para a Fase 5:

| Coluna | Tipo | Uso na Fase 5 |
|--------|------|----------------|
| `id` | UUID | PK, referência em dietas |
| `nome` | TEXT | Campo PANEL-01 |
| `whatsapp` | TEXT UNIQUE | Campo PANEL-01 |
| `plano` | TEXT CHECK ('1mes','3meses','6meses','12meses') | Campo PANEL-01 |
| `data_expiracao` | DATE | Campo PANEL-01 + PANEL-06 |
| `ativo` | BOOLEAN DEFAULT true | PANEL-04 + PANEL-05 |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auditoria |

**Sem necessidade de migration nova** para a tabela `pacientes`.

**Campos da migration de entrevista** (`20260423000006_paciente_entrevista.sql`) — `entrevista_status`, `entrevista_dados`, `entrevista_etapa` — não são necessários no cadastro do painel (são populados pelo agente WhatsApp). O `POST /api/pacientes` não precisa setá-los (default `pendente` e `{}`).

### Storage bucket `dietas` — já existe [VERIFIED: codebase]

- Migration `20260422000004_storage_bucket.sql` cria o bucket `dietas` com `public: false`, limite de 50MB, apenas `application/pdf`.
- RLS policies: `authenticated` pode INSERT/SELECT/DELETE. `service_role` bypassa RLS automaticamente.
- **O backend usa service key** → bypassa RLS → upload funciona sem policy adicional.

### Nova migration necessária: `PANEL_API_KEY` como env var no backend

Não é uma migration de schema. É uma nova variável de ambiente no `.env` do backend:
```
PANEL_API_KEY=<chave-secreta-gerada>
```
E no `env.ts`, adicionar `PANEL_API_KEY` ao tipo `Env` e ao array `required`.

---

## Common Pitfalls

### Pitfall 1: Bucket `dietas` não é público — pdfUrl precisa ser path relativo

**What goes wrong:** `rag.ts` espera que `pdfUrl` siga o formato `${SUPABASE_URL}/storage/v1/object/public/dietas/...` (linha 27 do rag.ts). Mas o bucket `dietas` é privado (`public: false`). A função `processarDieta` usa `supabase.storage.from('dietas').download(path)` para baixar o arquivo com a service key, não acesso público.

**Why it happens:** A string de validação em `rag.ts` tem `STORAGE_PREFIX = .../object/public/dietas/` mas o bucket não é público.

**How to avoid:** Ao montar `pdfUrl` no backend de cadastro, usar:
```typescript
const pdfUrl = `${env.SUPABASE_URL}/storage/v1/object/dietas/${storagePath}`;
// sem "public" no path
```
E **atualizar o `STORAGE_PREFIX` em `rag.ts`** para remover o `/public/`:
```typescript
const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/dietas/`;
```
Ou melhor: não validar pela URL — usar o `path` diretamente e armazená-lo na coluna `pdf_url` da tabela `dietas`.

### Pitfall 2: `enviarBoasVindas()` existe em `agent.ts` mas o agente ainda não está completo

**What goes wrong:** `boas-vindas.ts` chama `enviarBoasVindas(pacienteId)` de `agent.ts`. Se `agent.ts` não tiver essa função bem definida (Fase 2 ainda parcialmente implementada), o cadastro vai falhar silenciosamente.

**Why it happens:** Fase 2 está `1/4` completa. O plano 02-03 (boas-vindas automática) ainda está pendente.

**How to avoid:** Verificar a implementação atual de `enviarBoasVindas` em `agent.ts` antes de integrá-la no fluxo de cadastro. Se não estiver pronta, o plano 05-02 deve incluir a implementação mínima de boas-vindas (enviar mensagem de texto simples via `sendText()` diretamente, sem depender do agente completo).

### Pitfall 3: CORS — frontend porta 5173 chamando backend porta 3001

**What goes wrong:** Em dev local, o Vite SPA em `localhost:5173` chama o backend em `localhost:3001`. O backend tem `app.use(cors())` sem restrição de origem, o que é suficiente em desenvolvimento mas deve ser revisado.

**Why it happens:** `cors()` sem opções permite qualquer origem.

**How to avoid:** Para v1 (painel interno), `cors()` sem restrição é aceitável. Para produção, opcionalmente restringir ao domínio do Railway do painel. Não bloqueia a fase.

### Pitfall 4: Variáveis de ambiente Vite devem ter prefixo `VITE_`

**What goes wrong:** Variáveis sem prefixo `VITE_` não são expostas ao bundle do frontend pelo Vite. `SUPABASE_ANON_KEY` deve ser `VITE_SUPABASE_ANON_KEY`, etc.

**Why it happens:** Por segurança, Vite expõe apenas variáveis prefixadas com `VITE_` via `import.meta.env`.

**How to avoid:** O `.env` do painel (`nutrichat-painel/.env.local`) deve ter:
```
VITE_SUPABASE_URL=https://iqpoohthfhmjkvrqxzns.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_BACKEND_URL=http://localhost:3001
VITE_PANEL_API_KEY=<panel_api_key>
```
No Railway (build-time), configurar estas como variáveis de ambiente no dashboard.

### Pitfall 5: SPA routing — refresh na URL retorna 404 sem Caddy

**What goes wrong:** Se o painel tiver rotas client-side (ex: `/login`, `/dashboard`) e o usuário fizer refresh, o servidor retorna 404 porque o arquivo `login.html` não existe.

**Why it happens:** SPA usa HTML5 History API; o servidor não conhece as rotas.

**How to avoid:** O `Caddyfile` com `try_files {path} /index.html` resolve isso. É o motivo pelo qual o Dockerfile usa Caddy (não `serve` ou Express estático simples). Mesmo sem rotas complexas (D-05), o refresh na raiz deve funcionar corretamente.

### Pitfall 6: `multer` e `express.json()` no mesmo router

**What goes wrong:** `express.json()` está aplicado globalmente em `index.ts` (`app.use(express.json({ limit: '10mb' }))`). O multer gerencia o próprio parsing de multipart; não há conflito porque `express.json()` só processa `Content-Type: application/json`. Para requests `multipart/form-data`, `express.json()` não faz nada e cede para o multer.

**Why it happens:** Preocupação comum mas não é um problema real neste caso.

**How to avoid:** Não há ação necessária. Confirmado: `express.json()` e multer coexistem sem conflito.

---

## Code Examples

### Completo: POST /api/pacientes (backend)

```typescript
// backend/src/routes/pacientes.ts
// Sources: multer docs, supabase storage upload docs, padrão existente em boas-vindas.ts
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { processarDieta } from '../services/rag';
import { enviarBoasVindas } from '../services/agent';

export const pacientesRouter = Router();

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') { cb(new Error('Apenas PDF')); return; }
    cb(null, true);
  },
});

function requirePanelKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-api-key'] !== env.PANEL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }
  next();
}

pacientesRouter.use(requirePanelKey);

pacientesRouter.post('/', upload.single('dieta'), async (req: Request, res: Response) => {
  const { nome, whatsapp, plano, data_expiracao } = req.body as {
    nome: string; whatsapp: string; plano: string; data_expiracao: string;
  };

  if (!req.file) { res.status(400).json({ error: 'PDF obrigatorio' }); return; }
  if (!nome || !whatsapp || !plano || !data_expiracao) {
    res.status(400).json({ error: 'Campos obrigatorios ausentes' }); return;
  }

  // 1. Inserir paciente
  const { data: paciente, error: pacienteErr } = await supabase
    .from('pacientes')
    .insert({ nome, whatsapp, plano, data_expiracao, ativo: true })
    .select('id').single();
  if (pacienteErr || !paciente) {
    res.status(500).json({ error: pacienteErr?.message }); return;
  }

  // 2. Upload PDF para Storage
  const storagePath = `${paciente.id}/${Date.now()}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from('dietas')
    .upload(storagePath, req.file.buffer, { contentType: 'application/pdf', upsert: false });
  if (uploadErr) { res.status(500).json({ error: uploadErr.message }); return; }

  const pdfUrl = `${env.SUPABASE_URL}/storage/v1/object/dietas/${storagePath}`;

  // 3. Inserir registro em dietas
  const { data: dieta, error: dietaErr } = await supabase
    .from('dietas')
    .insert({ paciente_id: paciente.id, pdf_url: pdfUrl, status: 'ativa' })
    .select('id').single();
  if (dietaErr || !dieta) { res.status(500).json({ error: dietaErr?.message }); return; }

  // 4. Boas-vindas (await — queremos confirmar o envio)
  await enviarBoasVindas(paciente.id).catch((err) => {
    console.error('[pacientes] Falha boas-vindas:', err);
  });

  // 5. Retornar imediatamente
  res.status(201).json({ sucesso: true, paciente_id: paciente.id });

  // 6. RAG em background (fire-and-forget)
  processarDieta(paciente.id, dieta.id, pdfUrl).catch((err) => {
    console.error('[pacientes] Falha RAG:', err);
  });
});
```

### Completo: LoginForm.tsx (frontend)

```typescript
// src/components/LoginForm.tsx
// Source: https://supabase.com/docs/guides/auth/quickstarts/react
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F7EC' }}>
      <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6" style={{ color: '#6B3D1E' }}>NutriChat</h1>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" required className="w-full border rounded px-3 py-2 mb-3" />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
          placeholder="Senha" required className="w-full border rounded px-3 py-2 mb-4" />
        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-2 rounded text-white font-semibold"
          style={{ background: '#2D5016' }}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 com `tailwind.config.js` e `content` array | Tailwind v4 com `@tailwindcss/vite` plugin, sem config file | Jan 2025 (v4 stable) | Instalação mais simples; sem PostCSS config |
| PostCSS para integrar Tailwind com Vite | Plugin nativo `@tailwindcss/vite` | Tailwind v4 | Remove `postcss.config.js` |
| `npm init vite@latest` (antiga sintaxe) | `npm create vite@latest` | Vite 3+ | Mesmo resultado, sintaxe canônica atual |
| Multer v1 (diskStorage padrão) | Multer v2.1.1 (memoryStorage explícito) | Mar 2026 | API estável; memoryStorage recomendado para envio a cloud storage |

---

## Env Vars Summary

### `nutrichat-painel` (build-time, prefix `VITE_`)

| Var | Valor em dev | Railway (build var) |
|-----|-------------|---------------------|
| `VITE_SUPABASE_URL` | `https://iqpoohthfhmjkvrqxzns.supabase.co` | Mesmo |
| `VITE_SUPABASE_ANON_KEY` | ver `.env` do backend | Mesmo |
| `VITE_BACKEND_URL` | `http://localhost:3001` | URL Railway do backend |
| `VITE_PANEL_API_KEY` | chave gerada | Mesmo |

### `nutrichat-backend` (adicionar ao `.env` e `env.ts`)

| Var | Descrição |
|-----|-----------|
| `PANEL_API_KEY` | Chave secreta compartilhada com o painel. Qualquer string aleatória segura. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ProtectedRoute` usando state local é suficiente sem React Router (D-05 SPA sem roteamento complexo) | Pattern 2 | Baixo — D-05 confirma SPA simples; ajuste trivial se React Router for necessário |
| A2 | `enviarBoasVindas()` em `agent.ts` está minimamente funcional para a Fase 5 | Pitfall 2 | Médio — se Fase 2 plan 02-03 não estiver completo, boas-vindas falha silenciosamente |
| A3 | A pdfUrl no formato `${SUPABASE_URL}/storage/v1/object/dietas/${path}` é compatível com o download em `rag.ts` | Pitfall 1 / Code Examples | Alto — rag.ts valida o prefixo da URL; se não coincidir, processarDieta lança erro |

---

## Open Questions

1. **Estado de `enviarBoasVindas()` em `agent.ts`**
   - O que sabemos: `boas-vindas.ts` importa e chama `enviarBoasVindas(pacienteId)`. Fase 2 está 1/4 completa (plan 02-03 pendente).
   - O que está incerto: Se `enviarBoasVindas` envia uma mensagem funcional ou é apenas um stub.
   - Recomendação: Plano 05-02 deve verificar a função e, se for stub, implementar o envio mínimo diretamente via `sendText()` no handler de cadastro.

2. **`pdfUrl` format em `rag.ts` (Pitfall 1)**
   - O que sabemos: `rag.ts` linha 27 usa `STORAGE_PREFIX = .../object/public/dietas/` mas o bucket é privado.
   - O que está incerto: Se a validação foi escrita antecipando um bucket público ou se é um bug latente.
   - Recomendação: Plano 05-02 deve incluir correção do `STORAGE_PREFIX` em `rag.ts` e usar o path relativo no cadastro.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build do painel + backend | ✓ | v22.15.1 | — |
| npm | Install dependências | ✓ | 11.0.0 | — |
| Docker | Dev containers + Railway deploy | ✓ | rodando (5 containers ativos) | — |
| nutrichat_backend | Rotas novas /api/pacientes | ✓ | Up 4 hours | — |
| Supabase Cloud | DB + Storage | ✓ (via backend existente) | — | — |

**Missing dependencies:** Nenhuma — ambiente completo disponível.

---

## Validation Architecture

> `workflow.nyquist_validation` não está setado como `false` em config.json — seção incluída.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Nenhum configurado no backend atual (sem jest/vitest) |
| Config file | Não existe — Wave 0 deve criar |
| Quick run | `npm run typecheck` (backend) |
| Full suite | Manual + Docker smoke test |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Login com email/senha retorna sessão válida | smoke manual | — | ❌ Wave 0 |
| AUTH-02 | Sessão persiste após reload | smoke manual | — | ❌ Wave 0 |
| AUTH-03 | Sem acesso sem login (ProtectedRoute) | smoke manual | — | ❌ Wave 0 |
| PANEL-01 | POST /api/pacientes aceita campos corretos | integration | `curl` smoke | ❌ Wave 0 |
| PANEL-02 | Upload PDF → Storage recebe arquivo | integration | `curl` smoke | ❌ Wave 0 |
| PANEL-03 | Boas-vindas disparadas após cadastro | smoke manual (WhatsApp) | — | — |
| PANEL-04 | GET /api/pacientes retorna status correto | unit (calcularStatus) | `npm run typecheck` | ❌ Wave 0 |
| PANEL-05 | PATCH /api/pacientes/:id com ativo=false | integration | `curl` smoke | ❌ Wave 0 |
| PANEL-06 | PATCH /api/pacientes/:id com nova data | integration | `curl` smoke | ❌ Wave 0 |

### Sampling Rate

- **Por task:** `npm run typecheck` no backend após cada alteração em `.ts`
- **Por wave:** Smoke test manual via `curl` nas 3 rotas novas + login no painel via browser
- **Phase gate:** Todos os 5 success criteria do ROADMAP.md verificados antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Nenhum framework de testes unitários está configurado — testes são smoke/manual para esta fase
- [ ] `env.ts` precisa de `PANEL_API_KEY` adicionado ao tipo `Env` e array `required`
- [ ] `api.ts` precisa do import e registro de `pacientesRouter`
- [ ] Bug latente em `rag.ts` linha 27 (`STORAGE_PREFIX` com `/public/`) deve ser corrigido em Wave 1

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Sim | Supabase Auth `signInWithPassword` — não hand-rolled |
| V3 Session Management | Sim | SDK Supabase gerencia refresh token automaticamente |
| V4 Access Control | Sim | `requirePanelKey` middleware; `ProtectedRoute` client-side |
| V5 Input Validation | Sim | Validação de campos no handler Express; `fileFilter` no multer |
| V6 Cryptography | Não | Sem operações criptográficas customizadas — delegado ao Supabase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Acesso não autorizado às rotas `/api/pacientes` | Spoofing | Middleware `requirePanelKey` — header `X-API-Key` obrigatório |
| Upload de arquivo malicioso (não-PDF) | Tampering | `multer fileFilter` valida `mimetype === 'application/pdf'` |
| Exposição da service key no frontend | Information Disclosure | `SUPABASE_SERVICE_KEY` NUNCA em variável `VITE_*` |
| Acesso ao painel sem autenticação | Elevation of Privilege | `<ProtectedRoute>` + Supabase session check |
| Enumeração de pacientes sem auth | Information Disclosure | `requirePanelKey` bloqueia GET sem chave |

---

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260422000001_create_schema.sql` — schema completo de `pacientes` verificado [VERIFIED: codebase]
- `supabase/migrations/20260422000003_rls_policies.sql` — RLS policies e service_role bypass verificados [VERIFIED: codebase]
- `supabase/migrations/20260422000004_storage_bucket.sql` — bucket `dietas`, `public: false`, 50MB limit [VERIFIED: codebase]
- `backend/src/services/rag.ts` — assinatura de `processarDieta()` e bug do STORAGE_PREFIX [VERIFIED: codebase]
- `backend/src/routes/boas-vindas.ts` — padrão `requireInternalKey` replicado [VERIFIED: codebase]
- `backend/src/index.ts` — `app.use(cors())` + `express.json({ limit: '10mb' })` globais [VERIFIED: codebase]
- https://tailwindcss.com/docs/installation/using-vite — setup Tailwind v4 + Vite plugin [CITED]
- https://docs.railway.com/guides/spa-routing-configuration — Caddyfile + Dockerfile para SPA Railway [CITED]
- https://supabase.com/docs/guides/auth/quickstarts/react — `signInWithPassword`, `onAuthStateChange` [CITED]
- https://supabase.com/docs/reference/javascript/initializing — `createClient` com `persistSession: true` [CITED]
- https://expressjs.com/en/resources/middleware/multer.html — `memoryStorage`, `upload.single()`, `req.file.buffer` [CITED]
- https://supabase.com/docs/reference/javascript/storage-from-upload — `.upload(path, buffer, { contentType })` [CITED]

### Secondary (MEDIUM confidence)
- npm registry — versões verificadas: multer 2.1.1, tailwindcss 4.2.4, @tailwindcss/vite 4.2.4, vite 8.0.10, react 19.2.5, @supabase/supabase-js 2.104.1 [VERIFIED: npm registry]

### Tertiary (LOW confidence)
- Nenhum claim LOW confidence neste documento.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas via npm registry
- Schema analysis: HIGH — migrations lidas diretamente do codebase
- Architecture patterns: HIGH — baseado em código existente + docs oficiais
- Deploy Railway: HIGH — Dockerfile + Caddyfile verificados na docs oficiais
- Pitfall rag.ts STORAGE_PREFIX: HIGH — código lido linha a linha
- enviarBoasVindas state: MEDIUM — depende do estado de implementação da Fase 2

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (Supabase SDK, Tailwind v4, Railway são estáveis)
