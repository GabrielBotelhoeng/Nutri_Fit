# Phase 5: Painel do Nutricionista - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 13
**Analogs found:** 8 / 13 (5 frontend sem analog — projeto novo)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/routes/pacientes.ts` | route/controller | CRUD + file-I/O | `backend/src/routes/alertas.ts` | exact (mesmo guard pattern, fire-and-forget) |
| `backend/src/routes/api.ts` | config/registry | request-response | `backend/src/routes/api.ts` (self) | exact |
| `backend/src/config/env.ts` | config | — | `backend/src/config/env.ts` (self) | exact |
| `backend/src/services/rag.ts` | service | file-I/O | `backend/src/services/rag.ts` (self, bug fix) | exact |
| `nutrichat-painel/src/lib/supabase.ts` | utility/client | request-response | nenhum no codebase | no-analog |
| `nutrichat-painel/src/App.tsx` | component | event-driven | nenhum no codebase | no-analog |
| `nutrichat-painel/src/components/LoginForm.tsx` | component | request-response | nenhum no codebase | no-analog |
| `nutrichat-painel/src/components/ProtectedRoute.tsx` | middleware/component | request-response | nenhum no codebase | no-analog |
| `nutrichat-painel/src/components/PacienteModal.tsx` | component | CRUD + file-I/O | nenhum no codebase | no-analog |
| `nutrichat-painel/src/components/StatusBadge.tsx` | component | transform | nenhum no codebase | no-analog |
| `nutrichat-painel/src/pages/Dashboard.tsx` | page | CRUD | nenhum no codebase | no-analog |
| `nutrichat-painel/src/main.tsx` | config | — | nenhum no codebase | no-analog |
| `nutrichat-painel/src/index.css` | config | — | nenhum no codebase | no-analog |
| `nutrichat-painel/vite.config.ts` | config | — | nenhum no codebase | no-analog |
| `nutrichat-painel/Dockerfile` | config | — | nenhum no codebase | no-analog |
| `nutrichat-painel/Caddyfile` | config | — | nenhum no codebase | no-analog |

---

## Pattern Assignments

### `backend/src/routes/pacientes.ts` (route/controller, CRUD + file-I/O)

**Analog principal:** `backend/src/routes/alertas.ts`
**Analog secundário:** `backend/src/routes/boas-vindas.ts`

**Imports pattern** — copiar de `alertas.ts` linhas 1-4, adicionar multer e supabase client:
```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
// adicionar:
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { processarDieta } from '../services/rag';
import { enviarBoasVindas } from '../services/agent';
```

**Auth guard pattern** — copiar de `alertas.ts` linhas 7-13, renomear função e trocar header:
```typescript
// alertas.ts linhas 7-13 (padrão canônico do projeto)
function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
// Para pacientes.ts: renomear para requirePanelKey, trocar header por 'x-api-key' e chave por env.PANEL_API_KEY
```

**Router export + guard apply** — copiar de `alertas.ts` linhas 5-6, 18:
```typescript
export const pacientesRouter = Router();
// ... função requirePanelKey ...
pacientesRouter.use(requirePanelKey); // aplica a todas as rotas abaixo
```

**Fire-and-forget pattern** — copiar de `alertas.ts` linhas 28-30:
```typescript
// alertas.ts linhas 28-30
dispararAlertas(horario).catch((err) => {
  console.error('[alertas] Erro ao disparar alertas:', err);
});
// Para pacientes.ts: substituir pela chamada processarDieta() após res.status(201)
```

**enviarBoasVindas com await + catch** — copiar de `boas-vindas.ts` linhas 20-22, mas usar await (não fire-and-forget):
```typescript
// boas-vindas.ts — padrão fire-and-forget (para referência)
enviarBoasVindas(pacienteId).catch((err) => {
  console.error(`[boas-vindas] Falha para paciente ${pacienteId}:`, err);
});
// Para pacientes.ts: usar await com catch inline (boas-vindas é esperada antes do 201)
await enviarBoasVindas(paciente.id).catch((err) => {
  console.error('[pacientes] Falha boas-vindas:', err);
});
```

**Supabase client (service key)** — copiar de `rag.ts` linha 7:
```typescript
// rag.ts linha 7
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
```

**Storage upload pattern** — copiar de `rag.ts` linhas 32-34 (padrão de download), adaptar para upload:
```typescript
// rag.ts linhas 32-34 (download — referência de uso do bucket 'dietas')
const { data: fileData, error: downloadError } = await supabase.storage
  .from('dietas')
  .download(path);
// Para pacientes.ts (upload):
const { error: uploadErr } = await supabase.storage
  .from('dietas')
  .upload(storagePath, req.file.buffer, { contentType: 'application/pdf', upsert: false });
```

**Construção da pdfUrl (bug fix STORAGE_PREFIX)** — conforme Pitfall 1 do RESEARCH.md. O `rag.ts` linha 27 usa `/public/` incorretamente — a URL correta é:
```typescript
// ERRADO (bug atual em rag.ts linha 27):
const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/public/dietas/`;
// CORRETO (para pacientes.ts E para corrigir rag.ts):
const pdfUrl = `${env.SUPABASE_URL}/storage/v1/object/dietas/${storagePath}`;
// rag.ts deve ser corrigido para:
const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/dietas/`;
```

**Error handling pattern** — copiar de `alertas.ts` linhas 21-24 (validação + 400):
```typescript
// alertas.ts linhas 21-24
if (!horario || !HORARIO_RE.test(horario)) {
  res.status(400).json({ error: 'horario invalido — formato esperado: HH:MM (ex: 07:30)' });
  return;
}
// Para pacientes.ts: adaptar para validar campos obrigatórios + arquivo PDF
if (!req.file) { res.status(400).json({ error: 'PDF obrigatorio' }); return; }
if (!nome || !whatsapp || !plano || !data_expiracao) {
  res.status(400).json({ error: 'Campos obrigatorios ausentes' }); return;
}
```

---

### `backend/src/routes/api.ts` (config/registry) — MODIFY

**Analog:** `backend/src/routes/api.ts` (self)

**Import pattern** — copiar das linhas 1-7, adicionar nova linha:
```typescript
// api.ts linhas 1-7 (padrão existente)
import { Router } from 'express';
import { webhookRouter } from './webhook';
import { ragRouter } from './rag';
import { boasVindasRouter } from './boas-vindas';
import { alertasRouter } from './alertas';
import { expiracaoRouter } from './expiracao';
import { relatorioRouter } from './relatorio';
import { aguaRouter } from './agua';
// adicionar:
import { pacientesRouter } from './pacientes';
```

**Registration pattern** — copiar do bloco linhas 10-18, adicionar nova linha:
```typescript
// api.ts linhas 12-18 (padrão canônico — uma linha por router)
apiRouter.use('/webhook', webhookRouter);
apiRouter.use('/rag', ragRouter);
// ...
// adicionar ao final:
apiRouter.use('/pacientes', pacientesRouter);
```

---

### `backend/src/config/env.ts` — MODIFY

**Analog:** `backend/src/config/env.ts` (self)

**Interface pattern** — copiar linhas 3-16, adicionar campo:
```typescript
// env.ts linhas 3-16 (padrão de interface tipada)
interface Env {
  // ... campos existentes ...
  INTERNAL_API_KEY: string;
  // adicionar:
  PANEL_API_KEY: string;
}
```

**Required array pattern** — copiar linhas 19-30, adicionar item:
```typescript
// env.ts linhas 19-30
const required = [
  // ... itens existentes ...
  'INTERNAL_API_KEY',
  // adicionar:
  'PANEL_API_KEY',
] as const;
```

**Return object pattern** — copiar linhas 37-51, adicionar propriedade:
```typescript
// env.ts linhas 37-51
return {
  // ... propriedades existentes ...
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY!,
  // adicionar:
  PANEL_API_KEY: process.env.PANEL_API_KEY!,
};
```

---

### `backend/src/services/rag.ts` — MODIFY (bug fix)

**Analog:** `backend/src/services/rag.ts` (self)

**Bug na linha 27** — única mudança necessária:
```typescript
// ANTES (linha 27 — bug: bucket não é público):
const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/public/dietas/`;
// DEPOIS (correto — sem /public/):
const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/dietas/`;
```
Esta correção garante que `processarDieta()` extraia o path corretamente quando chamada pelo handler de cadastro.

---

### `nutrichat-painel/src/lib/supabase.ts` (utility, request-response)

**Analog:** nenhum no codebase — usar RESEARCH.md Pattern 1.

Padrão canônico do Supabase para React SPA:
```typescript
// src/lib/supabase.ts — padrão oficial supabase.com/docs/guides/auth/quickstarts/react
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
```

---

### `nutrichat-painel/src/App.tsx` (component, event-driven)

**Analog:** nenhum no codebase — usar RESEARCH.md Pattern 1.

```typescript
// App.tsx — padrão onAuthStateChange + getSession
import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div>Carregando...</div>;
  return session ? <Dashboard session={session} /> : <LoginForm />;
}
```

---

### `nutrichat-painel/src/components/LoginForm.tsx` (component, request-response)

**Analog:** nenhum no codebase — usar RESEARCH.md Code Examples (LoginForm completo).

Padrão de estado e submit:
```typescript
// LoginForm.tsx — padrão useState + supabase.auth.signInWithPassword
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
```
Paleta: background `#F0F7EC`, título cor `#6B3D1E`, botão background `#2D5016`.

---

### `nutrichat-painel/src/components/ProtectedRoute.tsx` (middleware/component, request-response)

**Analog:** nenhum no codebase — usar RESEARCH.md Pattern 2.

SPA sem React Router (D-05): verificar sessão via `getSession()`, retornar null enquanto carrega, renderizar children se autenticado, redirecionar/exibir LoginForm se não.

---

### `nutrichat-painel/src/components/PacienteModal.tsx` (component, CRUD + file-I/O)

**Analog:** nenhum no codebase — usar RESEARCH.md Pattern 3.

Padrão de FormData com fetch:
```typescript
// PacienteModal.tsx — FormData + fetch + X-API-Key
const form = new FormData();
form.append('nome', dados.nome);
form.append('whatsapp', dados.whatsapp);
form.append('plano', dados.plano);
form.append('data_expiracao', dados.data_expiracao);
form.append('dieta', dados.pdf);  // fieldname deve coincidir com multer upload.single('dieta')

const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/pacientes`, {
  method: 'POST',
  headers: {
    'X-API-Key': import.meta.env.VITE_PANEL_API_KEY,
    // NÃO setar Content-Type — fetch define boundary do multipart automaticamente
  },
  body: form,
});
```
Feedback ao usuário após 201: `"✅ {nome} cadastrado — dieta sendo processada em segundo plano."`

---

### `nutrichat-painel/src/components/StatusBadge.tsx` (component, transform)

**Analog:** nenhum no codebase — usar lógica do RESEARCH.md Pattern 6.

O status é calculado no backend e enviado pronto na resposta do `GET /api/pacientes`. O componente apenas renderiza:
```typescript
// StatusBadge.tsx — mapeamento status → classes Tailwind + rótulo
const config = {
  ativo:      { label: '✅ Ativo',           bg: 'bg-green-100',  text: 'text-green-800' },
  expirando:  { label: '⚠️ Expirando',       bg: 'bg-yellow-100', text: 'text-yellow-800' },
  expirado:   { label: '❌ Expirado/Inativo', bg: 'bg-red-100',    text: 'text-red-800' },
};
```

---

### `nutrichat-painel/src/pages/Dashboard.tsx` (page, CRUD)

**Analog:** nenhum no codebase — usar padrão React useState + useEffect para fetch.

```typescript
// Dashboard.tsx — padrão fetch + estado local
const [pacientes, setPacientes] = useState<Paciente[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch(`${import.meta.env.VITE_BACKEND_URL}/api/pacientes`, {
    headers: { 'X-API-Key': import.meta.env.VITE_PANEL_API_KEY },
  })
    .then(r => r.json())
    .then(data => { setPacientes(data.pacientes); setLoading(false); });
}, []);
```

---

### `nutrichat-painel/src/main.tsx` (config)

**Analog:** nenhum — scaffolding padrão `npm create vite@latest --template react-ts`.
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

---

### `nutrichat-painel/src/index.css` (config)

**Analog:** nenhum — Tailwind v4 usa `@import` + `@theme` (sem `tailwind.config.js`):
```css
@import "tailwindcss";

@theme {
  --color-floresta: #2D5016;
  --color-offwhite: #F0F7EC;
  --color-terra: #6B3D1E;
}
```

---

### `nutrichat-painel/vite.config.ts` (config)

**Analog:** nenhum — padrão Tailwind v4 + `@tailwindcss/vite`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

---

### `nutrichat-painel/Dockerfile` + `Caddyfile` (config)

**Analog:** nenhum — padrão Railway SPA (RESEARCH.md Pattern 8):
```dockerfile
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
:80 {
    root * dist
    file_server
    try_files {path} /index.html
    encode gzip
    auto_https off
    trusted_proxies static private_ranges 100.0.0.0/8
}
```

---

## Shared Patterns

### API Key Guard (X-API-Key)
**Fonte:** `backend/src/routes/alertas.ts` linhas 7-13 (padrão `requireInternalKey`)
**Aplicar em:** `backend/src/routes/pacientes.ts` (todas as 3 rotas)
```typescript
// alertas.ts linhas 7-13 — copiar e adaptar
function requirePanelKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-api-key'] !== env.PANEL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
pacientesRouter.use(requirePanelKey);
```

### Fire-and-Forget para Operações Longas
**Fonte:** `backend/src/routes/alertas.ts` linhas 28-30
**Aplicar em:** `backend/src/routes/pacientes.ts` — chamada `processarDieta()` após res.status(201)
```typescript
// alertas.ts linhas 28-30 — padrão estabelecido no projeto
dispararAlertas(horario).catch((err) => {
  console.error('[alertas] Erro ao disparar alertas:', err);
});
// Em pacientes.ts (após res.status(201)):
processarDieta(paciente.id, dieta.id, pdfUrl).catch((err) => {
  console.error('[pacientes] Falha RAG:', err);
});
```

### Supabase Client com Service Key (server-side)
**Fonte:** `backend/src/services/rag.ts` linha 7
**Aplicar em:** `backend/src/routes/pacientes.ts`
```typescript
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
```

### Console.error com prefixo de módulo entre colchetes
**Fonte:** `backend/src/services/evolution.ts` linha 26, `rag.ts` linha 24, `alertas.ts` linha 29
**Aplicar em:** `backend/src/routes/pacientes.ts` — todos os catch
```typescript
console.error('[pacientes] <mensagem descritiva>:', err);
```

### Env var — adicionar ao tipo + array required + retorno
**Fonte:** `backend/src/config/env.ts` — padrão para toda nova variável de ambiente
**Aplicar em:** `backend/src/config/env.ts` — adição de `PANEL_API_KEY`
Três pontos de edição obrigatórios: `interface Env` (linha 3), array `required` (linha 19), objeto retornado (linha 37).

---

## No Analog Found

Files sem correspondente no codebase existente — planner deve usar padrões do RESEARCH.md:

| File | Role | Data Flow | Motivo |
|------|------|-----------|--------|
| `nutrichat-painel/src/lib/supabase.ts` | utility | request-response | Projeto React novo — sem frontend no codebase atual |
| `nutrichat-painel/src/App.tsx` | component | event-driven | Sem componentes React existentes |
| `nutrichat-painel/src/components/LoginForm.tsx` | component | request-response | Sem componentes React existentes |
| `nutrichat-painel/src/components/ProtectedRoute.tsx` | middleware/component | request-response | Sem componentes React existentes |
| `nutrichat-painel/src/components/PacienteModal.tsx` | component | CRUD + file-I/O | Sem componentes React existentes |
| `nutrichat-painel/src/components/StatusBadge.tsx` | component | transform | Sem componentes React existentes |
| `nutrichat-painel/src/pages/Dashboard.tsx` | page | CRUD | Sem páginas React existentes |
| `nutrichat-painel/src/main.tsx` | config | — | Vite scaffold padrão |
| `nutrichat-painel/src/index.css` | config | — | Tailwind v4 — sem CSS existente com @import |
| `nutrichat-painel/vite.config.ts` | config | — | Sem Vite config existente no projeto |
| `nutrichat-painel/Dockerfile` | config | — | Sem Dockerfile para frontend no projeto |
| `nutrichat-painel/Caddyfile` | config | — | Sem Caddyfile no projeto |

---

## Metadata

**Analog search scope:** `backend/src/routes/`, `backend/src/services/`, `backend/src/config/`
**Files scanned:** 6 arquivos lidos integralmente (alertas.ts, boas-vindas.ts, env.ts, api.ts, rag.ts, evolution.ts) + agent.ts linhas 325-349
**Pattern extraction date:** 2026-04-26
