---
phase: 6
slug: landing-page
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-28
---

# Phase 6 — UI Design Contract: Landing Page NutriChat

> Visual and interaction contract para a landing page do NutriChat.
> Gerado por gsd-ui-researcher. Verificação pendente pelo gsd-ui-checker.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Tailwind CSS v4 puro — sem shadcn) |
| Preset | not applicable |
| Component library | none |
| Icon library | lucide-react |
| Font | Inter (Google Fonts — padrão Next.js, fallback: system-ui, sans-serif) |

**Fonte:** D-02 (06-CONTEXT.md) — Tailwind v4 com `@theme {}`. Sem shadcn por decisão do usuário (projeto Tailwind-only, alinhado com o painel existente).

**Justificativa do Inter:** "Claude's Discretion" em 06-CONTEXT.md — Inter é leve, legível, amplamente suportado e combina com o tom profissional + acolhedor da paleta verde orgânica.

---

## Spacing Scale

Escala de 4 pontos. Todos os valores são múltiplos de 4px.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Gaps entre ícone e label |
| sm | 8px | Espaçamento interno de chips, gaps em listas compactas |
| md | 16px | Padding interno de cards, espaçamento padrão entre elementos |
| lg | 24px | Padding de seção em mobile, gap entre cards de planos em mobile |
| xl | 32px | Padding horizontal do container em tablet, gap entre cards em desktop |
| 2xl | 48px | Separação entre seções (padding-top/bottom de cada section) |
| 3xl | 64px | Padding de seções hero e planos em desktop |
| hero-canvas | 480px (altura) desktop / 360px tablet | Altura do canvas Three.js do hero |

**Exceções (explicitamente nomeadas):**
- Touch targets mínimos: 44px (altura de todos os botões e links CTA — WCAG 2.5.5)
- Container max-width: 1152px centralizado
- container-desktop: 80px — padding horizontal do container em telas ≥1024px (acima de xl=32px por necessidade de legibilidade em tela larga)
- badge-inline: 12px — padding lateral do badge "Mais Popular" (valor intermediário entre sm=8px e md=16px; necessário para badge pill compacto de 12px bold text em border-radius 99px)

---

## Typography

Fonte única: **Inter** (400 e 700 apenas).

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px | 400 (regular) | 1.6 |
| Label / Caption | 14px | 400 (regular) | 1.4 |
| Heading (H2 — títulos de seção) | 28px | 700 (bold) | 1.25 |
| Display (H1 — headline do hero) | 48px desktop / 36px mobile | 700 (bold) | 1.15 |

**Total de tamanhos distintos: 4 (14px, 16px, 28px, 48px/36px). Dentro do limite máximo de 4.**

**Notas de aplicação:**
- Subtítulos de seção (ex: "Seu assistente nutricional no WhatsApp"): usar **Body 16px, weight 700**, color `#A0694A` — não é um tamanho novo, é o token Body em bold
- Preço em destaque nos cards de plano (ex: "R$ 222/mês"): usar o **token Display (36px mobile)** — 36px já existe como a variante mobile do Display; não introduzir como tamanho separado
- Preço por mês (label abaixo do preço): 14px, weight 400, color `#A0694A` — token Label/Caption
- Apenas 2 pesos declarados: 400 e 700 — sem medium/semibold para manter consistência

---

## Color

Paleta completa definida em PROJETO.md. Distribuição 60/30/10 aplicada abaixo.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#F0F7EC` — Verde off-white | Background principal da página, fundo do hero, fundo de seções ímpares |
| Secondary (30%) | `#FFFFFF` e `#C8E6C0` — Branco e Verde menta | Fundo de cards (branco), fundo de seções alternadas (verde menta), nav background |
| Accent (10%) | `#2D5016` — Verde floresta | Botões CTA primários, headlines H1/H2, badge "Mais Popular", borda do card em destaque, links hover |
| Destructive | n/a | Sem ações destrutivas nesta fase |

**Tabela completa de tokens de cor (replicar do painel em `globals.css`):**

```css
@theme {
  --color-floresta:  #2D5016;  /* Verde floresta — primário */
  --color-medio:     #4A7C2F;  /* Verde médio — hover, bordas, ícones */
  --color-claro:     #7DB85A;  /* Verde claro — badges, highlights */
  --color-menta:     #C8E6C0;  /* Verde menta — card bg, seções alternadas */
  --color-offwhite:  #F0F7EC;  /* Verde off-white — bg principal */
  --color-terra:     #6B3D1E;  /* Marrom terra — tipografia principal */
  --color-claro-br:  #A0694A;  /* Marrom claro — subtítulos, texto secundário */
  --color-creme:     #FAF4ED;  /* Creme — seção escura invertida bg */
  --color-branco:    #FFFFFF;  /* Branco — cards, formulários */
}
```

**Acento reservado para (lista exaustiva — nunca usar fora desta lista):**
1. Botões CTA principais ("Falar com o nutricionista", "Quero esse plano")
2. Headline H1 do hero
3. Títulos H2 de cada seção
4. Badge "Mais Popular" (background `#2D5016`, texto `#F0F7EC`)
5. Borda do card de plano em destaque (3 meses)
6. Cor de hover em todos os links de navegação
7. Ícones de step numerados na seção "Como funciona"

**Combinações por seção (fonte: PROJETO.md):**
- **Hero:** bg `#F0F7EC` + H1 `#2D5016` + subtítulo `#A0694A` + CTA bg `#2D5016` texto `#F0F7EC`
- **Como funciona / Funcionalidades:** bg `#F0F7EC` + cards bg `#FFFFFF` borda `#C8E6C0`
- **Depoimentos:** bg `#C8E6C0` (seção alternada) + cards bg `#FFFFFF`
- **Planos:** bg `#F0F7EC` + card padrão bg `#FFFFFF` borda `#C8E6C0` + card destaque borda `#2D5016` shadow elevado
- **Seção escura (se usada como CTA highlight):** bg `#2D5016` + texto `#F0F7EC` + acento `#7DB85A`
- **Rodapé:** bg `#2D5016` + texto `#F0F7EC` + links hover `#7DB85A`

---

## Component Inventory

### Header / Nav
- Logo + nome "NutriChat" à esquerda (texto `#2D5016`, peso 700)
- Links de ancora: "Como funciona", "Funcionalidades", "Planos"
- CTA nav: botão "Falar com nutricionista" — bg `#2D5016`, texto branco, border-radius 8px
- Mobile: hamburger menu com drawer deslizante (Framer Motion AnimatePresence)
- Sticky: sim — `position: sticky; top: 0` com `backdrop-filter: blur(8px)` e bg `rgba(240,247,236,0.92)`
- Não anima on scroll (D-08)

### Hero Section
- Layout: grid 2 colunas em desktop (texto esquerda, canvas direita), stack em mobile
- H1: até 3 linhas em mobile, 2 linhas em desktop
- CTA primário: "Quero começar agora" → link `wa.me` pré-preenchido
- CTA secundário: "Como funciona ↓" → scroll suave para seção
- Canvas Three.js: visível apenas em `md` (≥768px) — `hidden md:block`
- Imagem estática mobile: `<img>` PNG/WebP — `block md:hidden`
- Celular 3D: animação idle — float (translateY -8px/+8px, 3s ease-in-out loop) + leve rotação Y (±5°, 4s loop)
- Chat na tela do celular: animação sequencial de 5 mensagens (3 do paciente + 2 do bot), delay 800ms entre cada, loop infinito

### Chat Animation Script (tela do celular 3D)
```
[0.0s] Paciente: "Oi! Acabei de almoçar 🍽️"
[0.8s] Bot: "Ótimo! Me conta o que você comeu?"
[1.6s] Paciente: "Arroz, frango grelhado e salada"
[2.4s] Bot: "Registrado! ✅ Você consumiu 520kcal. Faltam 880kcal para a meta de hoje."
[3.2s] Paciente: "Perfeito, obrigado!"
[4.0s] → reinicia do início
```

### Seção "Como funciona" (4 passos)
- Layout: grid 4 colunas desktop / 2 colunas tablet / 1 coluna mobile
- Cada step: número circular (`#2D5016` bg, texto `#F0F7EC`), ícone Lucide, título bold, descrição body
- Steps:
  1. "Nutricionista cadastra" — ícone `UserPlus`
  2. "Agente contata o paciente" — ícone `MessageCircle`
  3. "Paciente registra refeições" — ícone `Camera`
  4. "Relatório semanal automático" — ícone `BarChart2`
- Framer Motion: cada card entra com `fadeInUp` ao entrar na viewport (delay escalonado: 0, 100, 200, 300ms)

### Seção "Funcionalidades" (6 itens)
- Layout: grid 3 colunas desktop / 2 colunas tablet / 1 coluna mobile
- Cada item: card branco, borda `#C8E6C0`, ícone Lucide colorido em `#4A7C2F`, título 16px bold, descrição 14px
- Funcionalidades:
  1. "Registro por foto" — ícone `Image`
  2. "Registro por áudio" — ícone `Mic`
  3. "Alertas inteligentes" — ícone `Bell`
  4. "Relatório semanal" — ícone `FileText`
  5. "Cálculo de macros" — ícone `Calculator`
  6. "Substituição de alimentos" — ícone `Repeat`
- Framer Motion: `staggerChildren` 80ms

### Seção "Depoimentos" (3 cards placeholder)
- bg de seção: `#C8E6C0`
- Cards: bg `#FFFFFF`, borda-radius 12px, shadow `0 2px 12px rgba(45,80,22,0.08)`
- Conteúdo placeholder: avatar cinza + nome fictício + texto de depoimento sobre resultado com o NutriChat
- 3 cards: "Maria S.", "João P.", "Ana C." — frases curtas sobre resultados nutricionais

### Seção "Planos" (4 cards)
- Layout: grid 4 colunas desktop / 2 colunas tablet / 1 coluna mobile
- Card padrão: bg `#FFFFFF`, borda 1.5px `#C8E6C0`, border-radius 12px
- Card destaque (3 meses): borda 2px `#2D5016`, shadow `0 8px 32px rgba(45,80,22,0.16)`, escala 1.04 em desktop
- Badge "Mais Popular": posição absolute top -12px center, bg `#2D5016`, texto `#F0F7EC`, 12px bold, padding 4px 12px (badge-inline token), border-radius 99px
- Preço do plano em destaque: renderizado com token Display (36px mobile / 48px desktop), weight 700, color `#2D5016`
- CTA de cada card: botão full-width "Quero esse plano" → `wa.me` com texto pré-preenchido
- Planos:
  | Plano | Preço | Destaque |
  |-------|-------|---------|
  | 1 mês | R$ 330/mês | — |
  | 3 meses | R$ 222/mês | "Mais Popular" |
  | 6 meses | R$ 130/mês | — |
  | 12 meses | R$ 89,90/mês | — |

### Rodapé
- bg `#2D5016`, texto `#F0F7EC`
- Logo + tagline curta: "Seu assistente nutricional inteligente no WhatsApp"
- Links: contato (email), WhatsApp, GitHub do projeto
- Copyright: "© 2026 NutriChat"
- Sem animação (D-08)

---

## Animações e Interações

| Elemento | Animação | Biblioteca | Spec |
|----------|----------|------------|------|
| Celular 3D — float | Idle loop | react-three-fiber (@react-three/drei `Float`) | amplitude 0.3, speed 1.5, rotationIntensity 0.2 |
| Celular 3D — chat | Sequencial com delay | r3f custom state machine | 5 mensagens, 800ms intervalo, loop infinito |
| Seções — entrada | fadeInUp ao entrar na viewport | Framer Motion `whileInView` | opacity 0→1, y 20→0, duration 0.5s, ease "easeOut" |
| Cards — hover | Elevação sutil | CSS transition | `transform: translateY(-4px)`, `box-shadow` intensificado, duration 200ms |
| Botões CTA — hover | Cor de fundo | CSS transition | bg `#2D5016` → `#4A7C2F`, duration 150ms |
| Nav — hamburger | Drawer mobile | Framer Motion AnimatePresence | slide from right, 250ms |
| Scroll suave | Âncoras | CSS nativo | `scroll-behavior: smooth` no `<html>` |

**Framer Motion `fadeInUp` preset padrão (usar em todos os elementos animados):**
```ts
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
}
```

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| H1 hero (PT) | "Seu paciente acompanhado. Você tranquilo." |
| Subtítulo hero | "O NutriChat cuida do acompanhamento nutricional no WhatsApp — registro de refeições, alertas e relatórios automáticos." |
| CTA primário hero | "Quero começar agora" |
| CTA secundário hero | "Como funciona" |
| Título "Como funciona" | "Simples para o nutricionista, poderoso para o paciente" |
| Título "Funcionalidades" | "Tudo que seu paciente precisa, no WhatsApp que ele já usa" |
| Título "Depoimentos" | "O que nossos pacientes dizem" |
| Subtítulo depoimentos | "Resultados reais de pessoas acompanhadas pelo NutriChat" |
| Título "Planos" | "Escolha o plano ideal" |
| Subtítulo planos | "Acesso completo ao NutriChat. Sem apps para instalar." |
| CTA de cada plano | "Quero esse plano" |
| Mensagem pré-preenchida WA (1 mês) | "Olá! Tenho interesse no plano de 1 mês do Nutri Chat. Pode me passar mais informações?" |
| Mensagem pré-preenchida WA (3 meses) | "Olá! Tenho interesse no plano de 3 meses do Nutri Chat. Pode me passar mais informações?" |
| Mensagem pré-preenchida WA (6 meses) | "Olá! Tenho interesse no plano de 6 meses do Nutri Chat. Pode me passar mais informações?" |
| Mensagem pré-preenchida WA (12 meses) | "Olá! Tenho interesse no plano de 12 meses do Nutri Chat. Pode me passar mais informações?" |
| Rodapé tagline | "Seu assistente nutricional inteligente no WhatsApp" |
| Empty state (depoimentos) | n/a — conteúdo é sempre placeholder estático nesta fase |
| Error state (se link WA falhar) | Não exibido — link `wa.me` sempre funciona; sem estado de erro visível |
| Ações destrutivas | Nenhuma nesta fase — landing page é totalmente de leitura e redirecionamento |

**Depoimentos placeholder:**

| Card | Nome | Texto |
|------|------|-------|
| 1 | Maria S., 32 anos | "Em 3 semanas já perdi 2kg. O bot me lembra de tudo e ainda calcula o que eu como em segundos." |
| 2 | João P., 28 anos | "Nunca consegui seguir uma dieta antes. Com o NutriChat ficou fácil porque é tudo pelo WhatsApp mesmo." |
| 3 | Ana C., 41 anos | "Minha nutricionista consegue ver tudo que comi durante a semana. O acompanhamento melhorou muito." |

---

## Layout e Responsividade

| Breakpoint | Valor | Container |
|------------|-------|-----------|
| Mobile | < 768px | 100% - 32px padding |
| Tablet (md) | 768px – 1023px | 100% - 48px padding |
| Desktop (lg) | 1024px – 1151px | 100% - 80px padding (container-desktop token) |
| Desktop wide (xl) | ≥ 1152px | 1152px max-width, auto margin |

**Regras mobile-first críticas:**
- Hero canvas Three.js: `hidden md:block` — só renderiza em ≥768px (D-12)
- Hero imagem estática: `block md:hidden` — visível apenas em < 768px (D-13)
- Grid "Como funciona": `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Grid "Funcionalidades": `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Grid "Planos": `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`
- Card destaque (3 meses): escala 1.04 apenas em `lg:scale-105` — sem escala em mobile/tablet

---

## Estrutura de Arquivos da Landing (Next.js App Router)

```
nutrichat-landing/
├── app/
│   ├── layout.tsx          # RootLayout com Inter font + globals.css
│   ├── page.tsx            # Composição das seções
│   └── globals.css         # @theme {} com tokens de cor + Tailwind v4
├── components/
│   ├── Header.tsx
│   ├── Hero.tsx            # Canvas Three.js condicional + fallback img
│   ├── PhoneCanvas.tsx     # react-three-fiber — só importado em md+
│   ├── HowItWorks.tsx
│   ├── Features.tsx
│   ├── Testimonials.tsx
│   ├── Plans.tsx
│   └── Footer.tsx
└── public/
    └── hero-phone-static.webp  # Imagem estática para mobile (D-13)
```

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| npm — react-three-fiber (@react-three/fiber) | Canvas, useFrame, useThree | not applicable — npm package, not shadcn registry |
| npm — @react-three/drei | Float, PerspectiveCamera, Environment | not applicable — npm package |
| npm — framer-motion | motion.div, AnimatePresence, whileInView | not applicable — npm package |
| npm — lucide-react | Ícones declarados na seção de componentes | not applicable — npm package |
| shadcn registry | nenhum bloco usado | not required — shadcn não inicializado |
| third-party registries | nenhum | not applicable |

**Resultado do shadcn gate:** `components.json` ausente. Stack é Next.js mas o projeto optou explicitamente por Tailwind CSS puro (D-02 em 06-CONTEXT.md). shadcn não será inicializado. Tool: none.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Rastreabilidade de Fontes

| Decisao | Fonte |
|---------|-------|
| Framework Next.js + Tailwind v4 | D-01, D-02 — 06-CONTEXT.md |
| react-three-fiber para hero 3D | D-03 — 06-CONTEXT.md |
| Chat animado na tela do celular | D-04 — 06-CONTEXT.md |
| Animação idle float + rotação Y | D-05 — 06-CONTEXT.md |
| Fundo hero #F0F7EC | D-06 — 06-CONTEXT.md |
| Framer Motion fade-in sutil | D-07, D-08 — 06-CONTEXT.md |
| Plano 3 meses destacado | D-09 — 06-CONTEXT.md |
| 4 cards de planos com preços | D-10 — 06-CONTEXT.md |
| CTA WhatsApp pré-preenchido | D-11 — 06-CONTEXT.md |
| Mobile: imagem estática < 768px | D-12, D-13 — 06-CONTEXT.md |
| Ordem das seções | D-14 — 06-CONTEXT.md |
| Paleta de cores completa | PROJETO.md §Identidade visual |
| Tipografia Inter | Claude's Discretion — 06-CONTEXT.md |
| Ícones lucide-react | Claude's Discretion — 06-CONTEXT.md |
| Copy de depoimentos placeholder | Claude's Discretion — 06-CONTEXT.md |
| Tokens de cor CSS | nutrichat-painel/src/index.css (expandido) |
| Typography fix (4 sizes max) | gsd-ui-checker revision 2026-04-28 |
| Spacing exceptions (badge-inline, container-desktop) | gsd-ui-checker revision 2026-04-28 |

---

*Phase 6 — UI-SPEC gerado em 2026-04-28 por gsd-ui-researcher. Revisado em 2026-04-28 por gsd-ui-researcher (checker revision).*
