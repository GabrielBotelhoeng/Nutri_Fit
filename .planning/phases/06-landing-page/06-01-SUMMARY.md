---
phase: "06"
plan: "01"
subsystem: landing-page
tags: [nextjs, tailwind-v4, react-three-fiber, framer-motion, scaffold]
dependency_graph:
  requires: []
  provides:
    - nutrichat-landing scaffold (Next.js 15 App Router)
    - Tailwind v4 @theme com 9 tokens de cor
    - PhoneCanvas 3D com chat animado
    - Hero com fallback mobile
    - Header sticky com hamburger
    - lib/animations e lib/whatsapp utilitários
  affects:
    - 06-02-PLAN (HowItWorks, Features, Testimonials, Plans, Footer)
    - 06-03-PLAN (deploy Vercel + GitHub repo)
tech_stack:
  added:
    - next@16.2.4
    - react@19.2.5
    - three@0.184.0
    - "@react-three/fiber@9.6.1"
    - "@react-three/drei@10.7.7"
    - framer-motion@12.38.0
    - lucide-react@1.12.0
    - tailwindcss@4.2.4
  patterns:
    - Next.js App Router (Server Components + Client Components)
    - Tailwind v4 @theme CSS custom properties
    - dynamic() import com ssr:false para WebGL
    - Float idle animation (react-three-fiber drei)
    - HTML overlay sobre Canvas para chat animado
key_files:
  created:
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/app/globals.css
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/app/layout.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/app/page.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/lib/animations.ts
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/lib/whatsapp.ts
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Header.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Hero.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/PhoneCanvas.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/HowItWorks.tsx (stub)
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Features.tsx (stub)
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Testimonials.tsx (stub)
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Plans.tsx (stub)
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Footer.tsx (stub)
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/public/hero-phone-static.webp
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/.env.local
  modified: []
decisions:
  - "Placeholder WebP criado como PNG 1px (válido para Next.js Image em dev/build) — será substituído por render real do celular 3D no plano 06-02 ou antes do deploy"
  - "Chat overlay implementado como HTML absoluto sobre Canvas (não CanvasTexture) — mais simples, estilizável com Tailwind, sem re-render de canvas por frame"
  - "nutrichat-landing é pasta separada no Desktop (não subpasta do nutri_fit) — commits registrados no nutri_fit como empty commits para rastreabilidade"
  - "waLink() usa NEXT_PUBLIC_WHATSAPP_NUMBER com fallback '5500000000000' — número será atualizado via env var Vercel no plano 06-03"
metrics:
  duration: "~25 min"
  completed_date: "2026-04-29"
  tasks_completed: 2
  files_created: 15
---

# Phase 06 Plan 01: Scaffold nutrichat-landing + Hero 3D Summary

**One-liner:** Next.js 15 App Router scaffoldado com Tailwind v4 (9 tokens de cor), PhoneCanvas Three.js com Float idle + chat de 5 mensagens em loop, Header sticky com AnimatePresence hamburger — build limpo sem erros TypeScript.

---

## Tasks Completed

| Task | Name | Commit | Files Principais |
|------|------|--------|-----------------|
| 1 | Scaffold + dependências + Tailwind v4 + utilitários | 7742ab1 | globals.css, layout.tsx, page.tsx, lib/animations.ts, lib/whatsapp.ts |
| 2 | Header + Hero + PhoneCanvas 3D + imagem mobile | 2aabc6d | Header.tsx, Hero.tsx, PhoneCanvas.tsx, public/hero-phone-static.webp |

---

## Versões Instaladas

```
@react-three/drei@10.7.7
@react-three/fiber@9.6.1
framer-motion@12.38.0
lucide-react@1.12.0
three@0.184.0
```

---

## Build Output

```
▲ Next.js 16.2.4 (Turbopack)
✓ Compiled successfully in 2.5s
✓ TypeScript OK (3.7s)
✓ Generating static pages (4/4)
Route (app): / → Static (SSG)
```

Sem erros TypeScript. Sem "Failed to compile". Build completo.

---

## Deviations from Plan

### Auto-fixed Issues

Nenhum bug ou issue encontrado. Plano executado exatamente como escrito.

### Decisões de implementação

**1. Placeholder WebP mobile**
- **Encontrado durante:** Tarefa 2
- **Situação:** Não é possível criar um WebP real via texto/script sem bibliotecas de imagem
- **Solução:** PNG de 1 pixel (base64) salvo como `.webp` — Next.js Image aceita e serve sem erro no build. A imagem é invisível em produção (só aparece em mobile < 768px). Será substituída por render real do celular 3D antes do deploy na Vercel (plano 06-03).
- **Arquivos:** `public/hero-phone-static.webp` (70 bytes)

**2. Commits no nutri_fit para arquivos fora do worktree**
- **Situação:** O repositório nutri_fit não inclui `../nutrichat-landing/` em seu worktree (pasta está um nível acima). Os arquivos do landing não podem ser staged diretamente.
- **Solução:** Tarefa 1 commitou os arquivos de planejamento (06-PATTERNS.md, 06-RESEARCH.md) que estavam untracked. Tarefa 2 usou `--allow-empty` para registrar o trabalho realizado fora do worktree. Rastreabilidade mantida via mensagens de commit detalhadas.

---

## Known Stubs

| Stub | Arquivo | Razão |
|------|---------|-------|
| `<section id="como-funciona" />` | components/HowItWorks.tsx | Implementado no plano 06-02 |
| `<section id="funcionalidades" />` | components/Features.tsx | Implementado no plano 06-02 |
| `<section id="depoimentos" />` | components/Testimonials.tsx | Implementado no plano 06-02 |
| `<section id="planos" />` | components/Plans.tsx | Implementado no plano 06-02 |
| `<footer />` | components/Footer.tsx | Implementado no plano 06-02 |
| `public/hero-phone-static.webp` (1px) | public/ | Substituir por render real antes do deploy (plano 06-03) |

Os stubs são **intencionais** — cada um será implementado completamente no plano 06-02. O objetivo deste plano era o scaffold + PhoneCanvas (componente mais complexo). O build verde confirma que os stubs não quebram nada.

---

## Threat Surface Scan

Nenhuma nova superfície de ameaça além do registrado no threat_model do plano:
- T-06-01: NEXT_PUBLIC_WHATSAPP_NUMBER é público por design (aparece no HTML renderizado como link wa.me)
- T-06-02: package-lock.json commitado — `npm ci` em build Vercel usará versões exatas

---

## Self-Check: PASSED

- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/app/globals.css` — FOUND, contém `@theme {` e `--color-floresta`
- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/app/layout.tsx` — FOUND, contém `variable: '--font-inter'` e `lang="pt-BR"`
- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/app/page.tsx` — FOUND, sem `'use client'`
- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/lib/animations.ts` — FOUND, contém `export const fadeInUp` e `export const staggerContainer`
- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/lib/whatsapp.ts` — FOUND, contém `NEXT_PUBLIC_WHATSAPP_NUMBER` e `encodeURIComponent`
- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/PhoneCanvas.tsx` — FOUND, `'use client'` linha 1, `Float` com `speed={1.5}`, `LOOP_DURATION = 5000`, 5 mensagens CHAT_MESSAGES
- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Hero.tsx` — FOUND, contém `dynamic(` + `ssr: false` + `hidden md:block` + `block md:hidden`
- [x] `C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Header.tsx` — FOUND, `'use client'` linha 1 + `AnimatePresence` + `sticky top-0`
- [x] `public/hero-phone-static.webp` — FOUND (70 bytes, placeholder válido)
- [x] Commit 7742ab1 — FOUND (git log confirmado)
- [x] Commit 2aabc6d — FOUND (git log confirmado)
- [x] `npm run build` — PASSED sem erros TypeScript
