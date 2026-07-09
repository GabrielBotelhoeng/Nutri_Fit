# Phase 5: Painel do Nutricionista - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 05-painel-do-nutricionista
**Areas discussed:** Onde o painel vive, Design do painel, Fluxo de cadastro, Autenticação

---

## Onde o painel vive

| Option | Description | Selected |
|--------|-------------|----------|
| App separado React+Vite | Repositório próprio, Railway, Fase 5 e 6 independentes | ✓ |
| Junto com a landing (Next.js) | Um único projeto Next.js com /app e /app/painel | |

**User's choice:** App separado React+Vite no Railway

| Option | Description | Selected |
|--------|-------------|----------|
| Railway + porta 5173 local | Consistente com a stack, Vite dev na 5173 | ✓ |
| Vercel (como a landing) | Mistura painel interno com landing pública | |

**User's choice:** Railway + porta 5173 local

---

## Design do painel

| Option | Description | Selected |
|--------|-------------|----------|
| Funcional + paleta NutriChat | Tailwind com cores do projeto, tabela limpa, badges de status | ✓ |
| Mínimo absoluto (HTML vanilla-like) | CSS simples, extremamente rápido mas amador | |
| Polido com component library | shadcn/ui ou Radix + Tailwind, mais tempo de setup | |

**User's choice:** Funcional + paleta NutriChat (Tailwind puro)

| Option | Description | Selected |
|--------|-------------|----------|
| Uma página só | Login → Lista com modal para cadastro/edição | ✓ |
| Duas páginas | /pacientes (lista) e /pacientes/novo (formulário separado) | |

**User's choice:** Uma página só

---

## Fluxo de cadastro de paciente

| Option | Description | Selected |
|--------|-------------|----------|
| Tudo pelo backend | POST /api/pacientes multipart, backend orquestra tudo | ✓ |
| Frontend chama Supabase diretamente | Frontend usa Supabase SDK + chama backend só para boas-vindas | |

**User's choice:** Tudo pelo backend (segurança — service key no servidor)

| Option | Description | Selected |
|--------|-------------|----------|
| Assíncrono (fire-and-forget) | Backend retorna imediatamente, RAG em background | ✓ |
| Síncrono | Backend espera RAG completar (30-60s, péssima UX) | |

**User's choice:** Assíncrono — padrão já estabelecido no projeto

---

## Autenticação Supabase

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase Auth SDK no client | @supabase/supabase-js no frontend, JWT no localStorage | ✓ |
| Backend valida o token | Frontend envia JWT, backend valida em cada request | |

**User's choice:** Supabase Auth SDK direto no client

| Option | Description | Selected |
|--------|-------------|----------|
| API Key compartilhada (X-API-Key) | Header secreto para autorizar chamadas ao backend | ✓ |
| JWT do Supabase no header | Authorization: Bearer, backend valida com SUPABASE_JWT_SECRET | |

**User's choice:** API Key compartilhada — simples e suficiente para single-tenant

---

## Claude's Discretion

- Estrutura de pastas do projeto React+Vite
- Gestão de estado (useState/Context, sem Redux)
- Layout interno do modal de cadastro
- Validações client-side (HTML5 nativo ou react-hook-form leve)
- Lógica de status calculado (no backend ou no frontend)

## Deferred Ideas

- Dashboard com métricas e gráficos — v2
- Sidebar de navegação — não necessária para single-page
- Edição inline na tabela — modal é suficiente
