---
phase: "06"
plan: "02"
subsystem: landing-page
tags: [nextjs, refactor, white-label, single-tenant, env-vars, i18n-genero]
dependency_graph:
  requires:
    - 06-01-SUMMARY (scaffold Next.js + PhoneCanvas + Hero)
  provides:
    - lib/nutricionista.ts como fonte única dos dados do nutri
    - .env.example documentando NEXT_PUBLIC_NUTRI_*
    - Concordância de gênero parametrizada (feminino default, masculino via env)
    - Todos os 8 arquivos com hardcode "Camila Rocha / CRN-3 12.345" refatorados
  affects:
    - 06-03-PLAN (deploy Vercel — .env.production precisa ser populado antes de subir)
scope_change:
  before: >
    Plan 02 original (SaaS marketplace público, formulário genérico, sem persona fixa).
  after: >
    Single-tenant white-label — um nutri específico + pacientes dele. Persona "Camila Rocha"
    é placeholder de portfólio até fechar o primeiro cliente. Toda copy conversacional
    aceita override via env var, incluindo artigo/pronome/concordância de gênero.
  motivation: >
    Sessão de discovery em 2026-07-09 alinhou que o produto real é B2B white-label — o nutri
    contrata e mantém o painel + landing próprios. Plan 02 formal ficou obsoleto porque
    presumia captura pública tipo SaaS.
key_files:
  created:
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/lib/nutricionista.ts
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/.env.example
    - C:/Users/botel/OneDrive/Desktop/nutri_fit/.planning/phases/06-landing-page/06-02-SUMMARY.md
  modified:
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Hero.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Header.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Footer.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/StatsSection.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/Testimonials.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/components/PhoneCanvas.tsx
    - C:/Users/botel/OneDrive/Desktop/nutrichat-landing/app/layout.tsx
validation:
  build: "npm run build → ✓ Compiled successfully in 7.5s / TypeScript 10.1s / 4 páginas estáticas"
  hardcode_scan: >
    grep 'Camila|CRN-3 12.345|Nutri Camila' em **/*.{tsx,ts} → só sobram os fallbacks
    dentro de lib/nutricionista.ts (comportamento esperado).
---

# Fase 06 · Plan 02 — Parametrização white-label do nutricionista

## O que mudou de escopo

O Plan 02 formal (`06-02-PLAN.md`) foi escrito assumindo NutriChat = SaaS marketplace público
com formulário de captura genérico. Em 2026-07-09 o produto foi redefinido como **single-tenant
white-label**: um nutricionista contratante + os pacientes dele. A landing existe pra converter
os pacientes desse nutri específico, e portanto precisa exibir o nome, CRN, marca e concordância
de gênero do nutri real — não uma persona genérica.

Não seguimos o Plan 02 à letra. Em vez disso, o refactor abaixo entrega o único requisito real
que o Plan 02 tinha na prática: **conteúdo real do nutri na landing**, agora via env vars.

## O que foi feito

### 1. Fonte única — `lib/nutricionista.ts`

Objeto `nutri` com 11 campos + 2 helpers, cada campo aceitando override via `NEXT_PUBLIC_NUTRI_*`:

| Campo | Env var | Fallback (demo) |
|-------|---------|-----------------|
| `primeiroNome` | `NEXT_PUBLIC_NUTRI_PRIMEIRO_NOME` | `Camila` |
| `nomeCompleto` | `NEXT_PUBLIC_NUTRI_NOME_COMPLETO` | `Camila Rocha` |
| `iniciais` | `NEXT_PUBLIC_NUTRI_INICIAIS` | `C` |
| `marca` | `NEXT_PUBLIC_NUTRI_MARCA` | `Camila Rocha Nutrição` |
| `crn` | `NEXT_PUBLIC_NUTRI_CRN` | `CRN-3 12.345` |
| `crnSigla` | `NEXT_PUBLIC_NUTRI_CRN_SIGLA` | `CRN-3` |
| `especialidade` | `NEXT_PUBLIC_NUTRI_ESPECIALIDADE` | `Nutricionista clínica` |
| `especialidadeInline` | `NEXT_PUBLIC_NUTRI_ESPECIALIDADE_INLINE` | `nutricionista clínica` |
| `artigo` | `NEXT_PUBLIC_NUTRI_ARTIGO` | `a` |
| `pronome` | `NEXT_PUBLIC_NUTRI_PRONOME` | `ela` |
| `registrado` | `NEXT_PUBLIC_NUTRI_REGISTRADO` | `registrada` |

Helpers `artigoCapitalizado` e `pronomeCapitalizado` cobrem os casos de início de frase.

### 2. `.env.example`

Documenta as 11 vars com comentários explicando concordância de gênero (feminino default,
masculino via override) e o aviso de que `NEXT_PUBLIC_*` é embutido no bundle no build — mudar
o `.env.local` exige rebuild ou dev server restart.

### 3. Refactor dos 7 componentes com hardcode

Todos os hardcodes mapeados no handoff foram substituídos por leitura via `nutri`:

- **Hero.tsx** — avatar (l.166), assinatura (l.173, l.178), copy "Sou a Camila, nutricionista"
  (l.233), notificação "Camila • agora" (l.97).
- **Header.tsx** — avatar (l.56), nome (l.63), CRN (l.66).
- **Footer.tsx** — marca (l.17), CRN (l.18), copyright (l.62).
- **StatsSection.tsx** — card CRN-3 (l.18) + label "nutricionista clínica registrada" (l.19),
  usando `nutri.crnSigla`, `nutri.especialidadeInline`, `nutri.registrado`.
- **Testimonials.tsx** — 2 depoimentos que citam "a Camila" / "ela" agora usam template strings
  com `nutri.artigo`, `nutri.primeiroNome`, `nutri.pronome`, `pronomeCapitalizado`.
- **PhoneCanvas.tsx** — "Nutri Camila" (l.235) → `Nutri ${nutri.primeiroNome}`.
- **app/layout.tsx** — metadata (title/description) usa marca + especialidade + CRN.

### 4. Validação

- `npm run build` — verde. Compile 7.5s, TypeScript 10.1s, 4 páginas estáticas prerender OK.
- `grep 'Camila|CRN-3 12.345|Nutri Camila'` em `**/*.{tsx,ts}` — só o próprio `lib/nutricionista.ts`
  aparece nos resultados (fallbacks, comportamento esperado).

## O que NÃO foi feito (fora de escopo)

- **Onboardar um nutri real** — depende de fechar o primeiro cliente comercial. Quando fechar,
  copiar `.env.example` → `.env.local`, preencher os 11 campos, rebuildar.
- **Trocar avatares/fotos dos depoimentos** — hoje são iniciais em círculo. Fotos reais entram
  quando houver pacientes reais + termo de imagem assinado.
- **Traduções (i18n)** — landing é PT-BR only. Fora do escopo do produto.

## Próximo passo — Plan 03 (deploy Vercel)

Pré-condição: `.env.production` populado no dashboard Vercel com os 11 `NEXT_PUBLIC_NUTRI_*`.
Se subir sem essas vars, a landing entra no ar com o placeholder "Camila Rocha" (que hoje serve
como demo, mas eventualmente causa constrangimento se um cliente real acessar a URL).
