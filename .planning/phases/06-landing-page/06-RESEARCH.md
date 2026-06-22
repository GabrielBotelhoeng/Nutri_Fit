# Phase 6: Landing Page — Research

**Researched:** 2026-04-28
**Domain:** Next.js 15 + react-three-fiber + Framer Motion + Tailwind CSS v4 + Vercel
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Next.js + Tailwind CSS como stack principal. Repositório separado `nutrichat-landing`. Deploy automático na Vercel a partir do branch main.
- **D-02:** Tailwind v4. Paleta de cores via CSS custom properties — reutilizar a mesma paleta do painel.
- **D-03:** Celular 3D implementado com react-three-fiber (não Three.js standalone).
- **D-04:** A tela do celular exibe conversa animada em loop — mensagens sequenciais simulando o NutriChat.
- **D-05:** O celular flutua e rotaciona levemente em loop automático (animação idle). Sem parallax ou follow-mouse.
- **D-06:** Fundo do hero: `#F0F7EC`. Celular pode ter reflexos em verde menta (`#C8E6C0`).
- **D-07:** Framer Motion para scroll-reveal. Fade-in + slide suave ao entrar na viewport. Tom sutil e profissional.
- **D-08:** Apenas elementos de conteúdo animam (cards, títulos, itens). Header e footer não animam.
- **D-09:** Plano 3 meses (R$ 222/mês) com destaque visual: badge "Mais Popular", borda verde floresta, shadow pronunciado.
- **D-10:** 4 cards de planos: 1 mês (R$ 330), 3 meses (R$ 222/mês — destaque), 6 meses (R$ 130/mês), 12 meses (R$ 89,90/mês).
- **D-11:** CTA de cada plano: link `wa.me/55XXXXXXXXXXX?text=...` com mensagem pré-preenchida.
- **D-12:** Abaixo de 768px (md breakpoint), canvas Three.js substituído por imagem estática (PNG ou WebP).
- **D-13:** Imagem estática mobile deve mostrar o mesmo celular do hero.
- **D-14:** Ordem das seções: Hero → Como funciona → Funcionalidades → Depoimentos → Planos → Rodapé.

### Claude's Discretion

- Layout exato da seção "Como funciona"
- Tipografia (Inter, conforme UI-SPEC)
- Número exato de itens na seção de Funcionalidades (6, conforme UI-SPEC)
- Conteúdo dos depoimentos placeholder (definidos na UI-SPEC)
- Informações do rodapé
- Modelo 3D do celular (paramétrico — BoxGeometry/CylinderGeometry, sem GLB externo)

### Deferred Ideas (OUT OF SCOPE)

- Animação parallax com scroll no hero
- Three.js no mobile
- Página de detalhes de plano individual
- Blog ou artigos de nutrição
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LANDING-01 | Hero com celular 3D animado (Three.js) simulando conversa no NutriChat, fundo verde off-white | react-three-fiber v9.6.1 + drei Float + state machine de chat no useFrame |
| LANDING-02 | Seção "Como funciona" com 3-4 passos ilustrados | Framer Motion whileInView + staggerChildren, ícones lucide-react |
| LANDING-03 | Seção de funcionalidades principais: foto/áudio, alertas, relatório | Grid responsivo + cards com Tailwind v4 + Framer Motion |
| LANDING-04 | Seção de depoimentos (placeholders) | Cards estáticos + bg alternado menta |
| LANDING-05 | Seção de planos com preços e CTA WhatsApp pré-preenchido | Links wa.me com encodeURIComponent + NEXT_PUBLIC_WHATSAPP_NUMBER |
| LANDING-06 | Rodapé com contato e redes sociais | Componente Footer estático |
| LANDING-07 | Site responsivo (mobile-first) com paleta definida | Tailwind v4 @theme + breakpoints md/lg/xl |
| LANDING-08 | Deploy automático na Vercel a partir do GitHub | Vercel GitHub integration + env vars dashboard |
</phase_requirements>

---

## Summary

A landing page do NutriChat é uma aplicação Next.js 15 (App Router) com Tailwind CSS v4, react-three-fiber para o hero 3D, e Framer Motion para animações de scroll. O projeto fica num repositório separado (`nutrichat-landing`) e é publicado na Vercel com auto-deploy a partir do branch main.

O desafio principal é o hero 3D: um celular construído proceduralmente com BoxGeometry/RoundedBoxGeometry do drei, com chat animado na tela usando overlay HTML absoluto sobre o canvas (opção mais simples e manutenível), e animação idle via componente `Float` do drei. No mobile (< 768px) o canvas é completamente substituído por uma imagem WebP estática via `next/image`.

Todos os pacotes da stack estão alinhados: Next.js 16.2.4 em produção, react-three-fiber 9.6.1 compatível com React 19.2.x, Tailwind CSS 4.2.4, Framer Motion 12.38.0.

**Recomendação principal:** Usar overlay HTML absoluto para o chat da tela do celular (não CanvasTexture). É mais simples de implementar, mais fácil de animar com CSS/Framer Motion, e não exige re-render do canvas a cada frame de texto.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hero 3D (celular animado) | Browser/Client | — | WebGL exige APIs de browser; `ssr: false` obrigatório |
| Chat overlay na tela do celular | Browser/Client | — | HTML sobre canvas; posicionamento absoluto via CSS |
| Scroll-reveal animations | Browser/Client | — | Framer Motion opera no DOM do browser |
| Seções de conteúdo (SSG) | Frontend Server (SSR) | — | Next.js gera HTML estático em build; sem chamadas de API |
| CTA WhatsApp (link wa.me) | Browser/Client | — | Link externo; env var exposta via NEXT_PUBLIC_ |
| Deploy e assets | CDN / Static | — | Vercel Edge Network serve todos os assets |
| Imagem mobile fallback | CDN / Static | — | next/image otimiza e serve via CDN Vercel |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.4 | Framework SSG + SSR + App Router | Versão mais recente verificada no npm registry |
| react | 19.2.5 | Runtime do framework | Peer dep obrigatória do Next.js 16 |
| @react-three/fiber | 9.6.1 | Renderer React para Three.js | v9 requer React >=19 <19.3 — compatível com React 19.2.5 |
| @react-three/drei | 10.7.7 | Helpers r3f: Float, RoundedBox, Html | Ecossistema oficial pmndrs |
| three | 0.184.0 | Engine 3D subjacente | Peer dep do r3f >=0.156 |
| framer-motion | 12.38.0 | Animações de scroll-reveal | Padrão de mercado para animações React |
| lucide-react | 1.12.0 | Ícones SVG | Leve, tree-shakeable, API declarativa |
| tailwindcss | 4.2.4 | Utilitários CSS | Alinhado com o painel existente |

[VERIFIED: npm registry — todos os pacotes verificados via `npm view <pkg> version` em 2026-04-28]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tailwindcss/postcss | (incluído no tailwindcss v4) | PostCSS plugin para Next.js | Necessário pois Next.js usa PostCSS (não Vite) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Overlay HTML para chat | CanvasTexture + drawText | CanvasTexture é mais complexo (canvas 2D manual, re-render a cada frame), não aceita HTML/CSS styling — descartado |
| Float do drei para idle | useFrame manual com Math.sin | Float encapsula o loop de maneira declarativa, menos código, resultado idêntico |
| next/image para mobile | `<img>` tag normal | next/image otimiza, serve WebP, lazy load automático, e suporta `priority` para LCP |

**Installation:**
```bash
npx create-next-app@latest nutrichat-landing \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"

cd nutrichat-landing

npm install three @react-three/fiber @react-three/drei framer-motion lucide-react
```

**Version verification:**
```bash
npm view @react-three/fiber version   # 9.6.1
npm view @react-three/drei version    # 10.7.7
npm view three version                # 0.184.0
npm view framer-motion version        # 12.38.0
```

---

## Architecture Patterns

### System Architecture Diagram

```
GitHub push (main)
        │
        ▼
   Vercel Build
  (next build → SSG)
        │
        ▼
  Vercel Edge CDN
        │
        ├─── /            → page.tsx (SSG HTML)
        │                   Todas as seções renderizadas no servidor
        │                   exceto PhoneCanvas (client-only)
        │
        └─── /public/*    → Assets estáticos
             hero-phone-static.webp (imagem mobile)

Browser Request
        │
        ▼
  Hidratação React
        │
        ├─── Header (sticky, sem animação)
        ├─── Hero
        │     ├─── md+: PhoneCanvas (dynamic import ssr:false)
        │     │         └─ Canvas r3f → Phone3D → Float → chat overlay
        │     └─── <md: next/image (WebP estático)
        ├─── HowItWorks  ─┐
        ├─── Features     ├── whileInView (Framer Motion)
        ├─── Testimonials ┘
        ├─── Plans (links wa.me + NEXT_PUBLIC_WHATSAPP_NUMBER)
        └─── Footer (estático)
```

### Recommended Project Structure

```
nutrichat-landing/
├── app/
│   ├── layout.tsx          # RootLayout: Inter font + globals.css
│   ├── page.tsx            # Composição das seções (Server Component)
│   └── globals.css         # @import tailwindcss + @theme {}
├── components/
│   ├── Header.tsx          # Sticky nav + hamburger mobile
│   ├── Hero.tsx            # Grid 2-col desktop / stack mobile
│   ├── PhoneCanvas.tsx     # "use client" — Canvas r3f + Phone3D
│   ├── HowItWorks.tsx      # 4 steps com Framer Motion
│   ├── Features.tsx        # 6 cards com staggerChildren
│   ├── Testimonials.tsx    # 3 cards placeholder
│   ├── Plans.tsx           # 4 cards + CTA wa.me
│   └── Footer.tsx          # bg floresta + links
└── public/
    └── hero-phone-static.webp
```

### Pattern 1: create-next-app sem src/

**O que:** Scaffold padrão do Next.js 15 App Router, TypeScript, Tailwind v4, sem diretório src/.
**Quando usar:** Fase de setup (Plano 06-01, Wave 0).

```bash
# Source: https://nextjs.org/docs/app/api-reference/cli/create-next-app [VERIFIED]
npx create-next-app@latest nutrichat-landing \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

> Nota: `--no-src-dir` nega a flag `--src-dir`. Sem esse flag, o CLI pergunta interativamente se quer src/. Para script não-interativo, usar `--yes` com as flags acima para aceitar os padrões.

### Pattern 2: Tailwind v4 @theme com tokens de cor

**O que:** Definir custom properties de cor diretamente no CSS, sem tailwind.config.js.
**Quando usar:** Wave 0 do Plano 06-01 — configurar globals.css.

```css
/* app/globals.css */
/* Source: tailwindcss.com/docs/theme [VERIFIED] + padrão do nutrichat-painel/src/index.css */

@import "tailwindcss";

@theme {
  --color-floresta:  #2D5016;   /* Verde floresta — primário, CTAs, H1/H2 */
  --color-medio:     #4A7C2F;   /* Verde médio — hover, bordas */
  --color-claro:     #7DB85A;   /* Verde claro — badges, highlights */
  --color-menta:     #C8E6C0;   /* Verde menta — card bg, seções alternadas */
  --color-offwhite:  #F0F7EC;   /* Verde off-white — bg principal */
  --color-terra:     #6B3D1E;   /* Marrom terra — tipografia principal */
  --color-claro-br:  #A0694A;   /* Marrom claro — subtítulos, texto secundário */
  --color-creme:     #FAF4ED;   /* Creme — seção escura invertida */
  --color-branco:    #FFFFFF;   /* Branco — cards, formulários */

  /* Tipografia */
  --font-sans: var(--font-inter);
}

html {
  scroll-behavior: smooth;
}
```

> Tailwind v4 gera automaticamente classes como `bg-floresta`, `text-terra`, `border-menta` a partir dos tokens `--color-*` declarados no `@theme {}`. [VERIFIED: tailwindcss.com/docs/theme]

> **IMPORTANTE:** Tailwind v4 ainda requer `postcss.config.mjs` no Next.js (diferente do Vite onde é zero-config). O `create-next-app --tailwind` gera esse arquivo automaticamente. [CITED: Medium — Tailwind v4 + Next.js guide]

### Pattern 3: next/font/google com Inter no App Router

**O que:** Carregar Inter como fonte variável, self-hosted pelo Next.js (sem requests ao Google no browser).
**Quando usar:** app/layout.tsx.

```tsx
// app/layout.tsx
// Source: nextjs.org/docs/app/api-reference/components/font [VERIFIED]
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} antialiased`}>
      <body>{children}</body>
    </html>
  )
}
```

### Pattern 4: PhoneCanvas com dynamic import ssr:false

**O que:** Importar o componente Canvas do r3f apenas no cliente, nunca no servidor.
**Quando usar:** Qualquer componente pai do PhoneCanvas (Hero.tsx).

```tsx
// components/Hero.tsx
// Source: r3f.docs.pmnd.rs/getting-started/installation [VERIFIED]
'use client'
import dynamic from 'next/dynamic'
import Image from 'next/image'

const PhoneCanvas = dynamic(
  () => import('./PhoneCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[480px] bg-menta/20 rounded-2xl animate-pulse" />
    ),
  }
)

export default function Hero() {
  return (
    <section className="bg-offwhite min-h-screen flex items-center">
      <div className="max-w-[1152px] mx-auto px-8 grid md:grid-cols-2 gap-8 items-center">

        {/* Texto */}
        <div>
          <h1 className="text-floresta font-bold text-5xl leading-[1.15]">
            Seu paciente acompanhado. Você tranquilo.
          </h1>
          {/* ... CTAs ... */}
        </div>

        {/* Canvas 3D — visível apenas em md+ */}
        <div className="hidden md:block h-[480px]">
          <PhoneCanvas />
        </div>

        {/* Imagem estática — visível apenas em < md */}
        <div className="block md:hidden">
          <Image
            src="/hero-phone-static.webp"
            alt="NutriChat no WhatsApp"
            width={300}
            height={480}
            priority
            className="mx-auto"
          />
        </div>

      </div>
    </section>
  )
}
```

### Pattern 5: PhoneCanvas — celular 3D procedural com chat overlay

**O que:** Modelo de celular construído com geometrias Three.js (sem GLB), animação idle via Float do drei, e chat renderizado como HTML absoluto sobre o canvas.
**Quando usar:** components/PhoneCanvas.tsx — importado apenas no cliente.

```tsx
// components/PhoneCanvas.tsx
// Source: r3f.docs.pmnd.rs + drei.docs.pmnd.rs/staging/float [VERIFIED]
'use client'
import { Canvas } from '@react-three/fiber'
import { Float, RoundedBox } from '@react-three/drei'
import { useState, useEffect, useRef } from 'react'

// Mensagens do chat animado (D-04, UI-SPEC)
const CHAT_MESSAGES = [
  { from: 'user', text: 'Oi! Acabei de almoçar 🍽️', delay: 0 },
  { from: 'bot',  text: 'Ótimo! Me conta o que você comeu?', delay: 800 },
  { from: 'user', text: 'Arroz, frango grelhado e salada', delay: 1600 },
  { from: 'bot',  text: 'Registrado! ✅ 520kcal. Faltam 880kcal para a meta.', delay: 2400 },
  { from: 'user', text: 'Perfeito, obrigado!', delay: 3200 },
]
const LOOP_DURATION = 5000 // ms até reiniciar

function Phone() {
  return (
    <group>
      {/* Corpo do celular */}
      <RoundedBox args={[1.2, 2.4, 0.12]} radius={0.12} smoothness={4}>
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.6} />
      </RoundedBox>
      {/* Tela */}
      <RoundedBox args={[1.0, 2.0, 0.01]} radius={0.06} position={[0, 0, 0.07]}>
        <meshStandardMaterial color="#0a2a0a" roughness={0.1} />
      </RoundedBox>
    </group>
  )
}

export default function PhoneCanvas() {
  const [visibleCount, setVisibleCount] = useState(0)

  // State machine: exibe mensagens sequencialmente em loop
  useEffect(() => {
    let timeouts: ReturnType<typeof setTimeout>[] = []

    function scheduleMessages() {
      setVisibleCount(0)
      CHAT_MESSAGES.forEach((msg, i) => {
        const t = setTimeout(() => {
          setVisibleCount(i + 1)
        }, msg.delay)
        timeouts.push(t)
      })
      // Loop: reinicia após LOOP_DURATION
      const loop = setTimeout(scheduleMessages, LOOP_DURATION)
      timeouts.push(loop)
    }

    scheduleMessages()
    return () => timeouts.forEach(clearTimeout)
  }, [])

  return (
    <div className="relative w-full h-full">
      {/* Canvas 3D */}
      <Canvas camera={{ position: [0, 0, 4], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <Float
          speed={1.5}
          rotationIntensity={0.2}
          floatIntensity={0.3}
          floatingRange={[-0.15, 0.15]}
        >
          <Phone />
        </Float>
      </Canvas>

      {/* Chat overlay — HTML absoluto sobre o canvas */}
      {/* Posicionado sobre a área da tela do celular */}
      <div
        className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none"
        style={{ top: '12%', left: '22%', right: '22%', bottom: '12%' }}
      >
        <div className="flex flex-col gap-1 w-full px-1 text-[9px] leading-tight">
          {CHAT_MESSAGES.slice(0, visibleCount).map((msg, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-2 py-1 rounded-lg ${
                msg.from === 'user'
                  ? 'self-end bg-[#2D5016] text-white'
                  : 'self-start bg-white text-[#1a1a1a]'
              }`}
            >
              {msg.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

### Pattern 6: Framer Motion whileInView com staggerChildren

**O que:** Scroll-reveal com fade-in + slide, animando apenas uma vez ao entrar na viewport.
**Quando usar:** HowItWorks.tsx, Features.tsx — todos os cards de seção.

```tsx
// Source: motion.dev/docs/react-scroll-animations [VERIFIED via WebSearch]
import { motion } from 'framer-motion'

// Variante reutilizável (definida uma vez, importada onde necessário)
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' }
  }
}

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,  // 80ms entre cada filho (UI-SPEC)
    }
  }
}

// Uso em lista de cards:
export default function Features() {
  return (
    <section>
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        {features.map((feat, i) => (
          <motion.div key={i} variants={fadeInUp} className="...card styles...">
            {/* conteúdo */}
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
```

### Pattern 7: CTA WhatsApp com env var

**O que:** Link wa.me com número configurável via env var e mensagem pré-preenchida encodada.
**Quando usar:** Plans.tsx, Hero.tsx (CTA primário), Header.tsx (CTA nav).

```tsx
// components/Plans.tsx
const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5500000000000'

const plans = [
  { months: 1,  price: 'R$ 330/mês',    featured: false },
  { months: 3,  price: 'R$ 222/mês',    featured: true  },
  { months: 6,  price: 'R$ 130/mês',    featured: false },
  { months: 12, price: 'R$ 89,90/mês',  featured: false },
]

function waLink(months: number) {
  const text = encodeURIComponent(
    `Olá! Tenho interesse no plano de ${months} ${months === 1 ? 'mês' : 'meses'} do Nutri Chat. Pode me passar mais informações?`
  )
  return `https://wa.me/${phone}?text=${text}`
}
```

### Anti-Patterns a Evitar

- **Three.js sem dynamic import:** Importar `@react-three/fiber` diretamente em Server Component ou sem `ssr: false` causa erro `ReferenceError: window is not defined` no build. [VERIFIED: r3f docs]
- **tailwind.config.js com v4:** Tailwind v4 não usa `tailwind.config.js` para tokens de cor — defina tudo no `@theme {}` do CSS. Misturar os dois causa conflitos. [VERIFIED: tailwindcss.com/blog/tailwindcss-v4]
- **CanvasTexture para o chat:** Requer `ctx.fillText()` manual, sem suporte a emoji rendering consistente, sem CSS, e força re-render total do canvas a cada mensagem. Usar overlay HTML é superior.
- **AnimatePresence sem key:** Elementos animados com AnimatePresence precisam de `key` única; sem ela, o React reutiliza o elemento e a animação de saída não dispara. [ASSUMED — padrão Framer Motion]
- **NEXT_PUBLIC_ ausente:** Env vars sem o prefixo `NEXT_PUBLIC_` não ficam acessíveis no browser. Resultado: `undefined` silencioso no link wa.me.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Font loading otimizado | `<link rel="preload" ...>` manual | `next/font/google` | Self-hosting automático, zero CLS, sem request externo ao Google |
| Animação de flutuação 3D | Loop useFrame com Math.sin manual | `Float` do @react-three/drei | Encapsula frequência, amplitude e rotação; 3 linhas vs 30 |
| Otimização de imagem | `<img>` raw | `next/image` | WebP automático, lazy load, srcset responsivo, LCP otimizado |
| Scroll-reveal | IntersectionObserver manual | Framer Motion whileInView | Declarativo, sem cleanup manual, viewport `once: true` nativo |
| Hamburger mobile | CSS + JS manual | Framer Motion AnimatePresence | Slide animado com 5 linhas; lida com unmount corretamente |

**Key insight:** Neste domínio (Next.js + r3f), toda funcionalidade "simples" esconde casos de edge em SSR, hidratação e WebGL — usar as abstrações do ecossistema é obrigatório.

---

## Common Pitfalls

### Pitfall 1: Three.js + SSR = ReferenceError

**O que vai errar:** Importar `Canvas` ou qualquer componente com `useFrame`/`useThree` em um módulo que roda no servidor.
**Por que acontece:** Three.js acessa `window`, `document` e `WebGLRenderingContext` — APIs ausentes no Node.js.
**Como evitar:** SEMPRE importar PhoneCanvas com `dynamic(() => import('./PhoneCanvas'), { ssr: false })`. O componente PhoneCanvas também deve ter `'use client'` no topo.
**Warning signs:** Erro `ReferenceError: window is not defined` ou `Cannot read properties of undefined (reading 'getContext')` durante `next build`.

### Pitfall 2: Tailwind v4 — postcss.config.mjs é obrigatório no Next.js

**O que vai errar:** Tailwind v4 funciona sem config no Vite, mas o Next.js usa PostCSS — sem `postcss.config.mjs` as classes Tailwind não são processadas.
**Por que acontece:** Next.js tem seu próprio pipeline de CSS que requer plugin PostCSS explícito.
**Como evitar:** O `create-next-app --tailwind` gera automaticamente o `postcss.config.mjs` com `@tailwindcss/postcss`. Verificar que o arquivo existe antes de prosseguir.
**Warning signs:** Classes Tailwind sem efeito visual; `bg-floresta` não aplica cor.

### Pitfall 3: @react-three/fiber v9 requer React >=19 <19.3

**O que vai errar:** Se o projeto for criado com React 18 (versão legada), instalar r3f v9 levanta erro de peer dependency.
**Por que acontece:** r3f v9 é a versão React 19 — a v8 era para React 18.
**Como evitar:** `create-next-app@latest` instala React 19 por padrão em 2026. Verificar com `npm view react version` antes de instalar r3f. React 19.2.5 é compatível com r3f 9.6.1 (requer >=19 <19.3). [VERIFIED: npm view @react-three/fiber peerDependencies]
**Warning signs:** `npm install` com warnings de peer dependency sobre react version.

### Pitfall 4: Chat overlay não alinha com a tela do celular

**O que vai errar:** O overlay HTML posicionado com `absolute` pode não se sobrepor corretamente à área da tela do modelo 3D quando o canvas tem perspectiva e o modelo está rotacionado.
**Por que acontece:** O modelo 3D é projetado em perspectiva — a "tela" do celular não corresponde exatamente a uma região CSS fixa.
**Como evitar:** Usar `rotationIntensity` baixo (0.2) no Float para manter a rotação mínima. Ajustar o posicionamento do overlay com `inset` values testados visualmente. Alternativa: usar o componente `Html` do drei que ancora HTML diretamente a um ponto no espaço 3D.
**Warning signs:** Chat aparece fora da tela do celular em determinados ângulos.

### Pitfall 5: Vercel — env vars não disponíveis no build sem NEXT_PUBLIC_

**O que vai errar:** `WHATSAPP_NUMBER` sem o prefixo `NEXT_PUBLIC_` resulta em `undefined` no JavaScript do browser.
**Por que acontece:** Next.js inlines apenas variáveis com `NEXT_PUBLIC_` no bundle do cliente durante o build.
**Como evitar:** Nomear a variável `NEXT_PUBLIC_WHATSAPP_NUMBER` no Vercel dashboard. Em desenvolvimento local, adicionar ao `.env.local` (não commitar).
**Warning signs:** Links wa.me apontam para `https://wa.me/undefined?text=...`.

### Pitfall 6: Framer Motion v12 — breaking change no import

**O que vai errar:** Em Framer Motion v11+, o pacote foi renomeado de `framer-motion` para `motion`. Alguns exemplos online usam `import { motion } from 'motion/react'` em vez de `framer-motion`.
**Por que acontece:** A biblioteca foi rebranded para "Motion" — ambos os imports funcionam mas a documentação oficial usa `motion/react` para o pacote novo.
**Como evitar:** Usar `import { motion, AnimatePresence } from 'framer-motion'` — o pacote `framer-motion` ainda funciona como alias e está instalado. Não misturar os dois imports.
**Warning signs:** TypeScript error `Module not found: motion/react` se tentar usar o novo import sem instalar o pacote correto.

---

## Technical Approach

### Celular 3D: Overlay HTML vs CanvasTexture

| Abordagem | Complexidade | Suporte a Emoji | CSS/Tailwind | Re-render |
|-----------|-------------|----------------|--------------|-----------|
| **Overlay HTML (recomendado)** | Baixa | Nativo | Sim | Apenas componente React |
| CanvasTexture + drawText | Alta | Problemático | Não | Canvas inteiro a cada frame |

**Decisão:** Overlay HTML absoluto. O `<div>` com `pointer-events-none` é posicionado sobre o canvas usando `position: absolute`. A câmera é fixada (`position: [0, 0, 4]`) e `rotationIntensity={0.2}` mantém o celular quase frontal — a sobreposição visual é estável o suficiente para não distrair.

**Alternativa se o alinhamento for problemático:** Usar o componente `<Html>` do @react-three/drei, que ancora um elemento HTML a uma posição no espaço 3D, seguindo a projeção da câmera. Props relevantes: `position={[0, 0, 0.08]}`, `transform`, `occlude`.

### Deploy Vercel: Fluxo Mínimo

1. Push do repositório `nutrichat-landing` para GitHub
2. Acessar vercel.com → New Project → Import from GitHub
3. Vercel detecta Next.js automaticamente (zero config)
4. Em Settings → Environment Variables: adicionar `NEXT_PUBLIC_WHATSAPP_NUMBER`
5. Todo push na branch `main` dispara auto-deploy

**vercel.json:** Não é necessário para Next.js standard — Vercel detecta e configura automaticamente. Criar apenas se houver necessidade de redirects ou headers customizados. [CITED: vercel.com/docs/git/vercel-for-github]

---

## Gotchas & Pitfalls

(Consolidados na seção Common Pitfalls acima. Resumo executivo:)

1. **Three.js + SSR:** `dynamic(..., { ssr: false })` não é opcional — é obrigatório.
2. **Tailwind v4 + Next.js:** postcss.config.mjs é gerado pelo CLI; não deletar.
3. **r3f v9 + React 19:** Compatíveis. r3f v8 (React 18) não está alinhado com Next.js 16.
4. **Chat overlay vs CanvasTexture:** Overlay HTML é mais simples; CanvasTexture tem problemas com emoji.
5. **NEXT_PUBLIC_ prefix:** Obrigatório para env vars acessadas no browser.
6. **Framer Motion imports:** Usar `framer-motion` (não `motion/react`) para compatibilidade estável.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Nenhum detectado no projeto nutrichat-landing (novo repositório) |
| Config file | Wave 0 deve criar (se necessário) |
| Quick run command | `npm run build` — build sem erros é o critério de validação principal |
| Full suite command | `npm run lint && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LANDING-01 | Hero exibe canvas 3D sem erro de SSR | smoke | `npm run build` sem erros | ❌ Wave 0 |
| LANDING-02 | 4 steps "Como funciona" renderizam | smoke | `npm run build` | ❌ Wave 0 |
| LANDING-03 | 6 cards de funcionalidades renderizam | smoke | `npm run build` | ❌ Wave 0 |
| LANDING-04 | 3 cards de depoimentos renderizam | smoke | `npm run build` | ❌ Wave 0 |
| LANDING-05 | Links wa.me têm URL e texto corretos | manual | Inspecionar href no browser dev tools | ❌ Manual |
| LANDING-06 | Rodapé presente com links | smoke | `npm run build` | ❌ Wave 0 |
| LANDING-07 | Responsividade mobile/tablet/desktop | manual | Verificar em Chrome DevTools 375px, 768px, 1280px | ❌ Manual |
| LANDING-08 | Auto-deploy Vercel funciona após push | manual | Verificar URL da Vercel após push | ❌ Manual |

### Sampling Rate

- **Por task commit:** `npm run lint`
- **Por wave merge:** `npm run build` sem erros TypeScript
- **Phase gate:** `npm run build` verde + checklist manual de responsividade + link wa.me funcional

### Wave 0 Gaps

- [ ] Repositório `nutrichat-landing` criado com `create-next-app`
- [ ] Instalação de dependências: `npm install three @react-three/fiber @react-three/drei framer-motion lucide-react`
- [ ] `app/globals.css` com `@theme {}` completo
- [ ] `app/layout.tsx` com Inter font configurado
- [ ] `public/hero-phone-static.webp` — imagem placeholder para o fallback mobile

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >=18 | Next.js 15 build | ✓ | v22.15.1 | — |
| npm | Instalação de pacotes | ✓ | 11.0.0 | — |
| Git | Versionamento + Vercel deploy | ✓ | (git no PATH) | — |
| Vercel CLI | Deploy manual (opcional) | — | — | Deploy via Vercel dashboard (recomendado) |
| WebGL no browser | Canvas Three.js | ✓ | (Chrome/Edge modernos suportam) | Imagem estática mobile (D-12) |

**Missing dependencies with no fallback:** Nenhuma que bloqueie execução.

**Missing dependencies with fallback:**
- Vercel CLI não necessário — deploy via dashboard web é o fluxo padrão para auto-deploy com GitHub.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Overlay HTML absoluto sobre o Canvas será visualmente estável com rotationIntensity=0.2 | Pattern 5, Pitfall 4 | Chat pode aparecer desalinhado da tela do celular — fallback: usar Html do drei |
| A2 | `create-next-app@latest` em 2026 instala React 19 por padrão, compatível com r3f v9 | Standard Stack | Se instalar React 18, r3f v9 não funciona — solução: `npm install react@19 react-dom@19` |
| A3 | `RoundedBox` está disponível no @react-three/drei 10.7.7 | Pattern 5 | Se ausente, usar `BoxGeometry` padrão sem borda arredondada |
| A4 | Framer Motion 12.x mantém compatibilidade com `import { motion } from 'framer-motion'` | Pattern 6, Pitfall 6 | Import pode quebrar — verificar com `import { motion } from 'framer-motion'` no Wave 0 |

---

## Open Questions

1. **Onde gerar a imagem mobile estática (hero-phone-static.webp)?**
   - O que sabemos: D-13 exige imagem que mostre o mesmo celular do hero 3D.
   - O que está incerto: Se tirar screenshot do canvas renderizado ou usar uma imagem criada separadamente.
   - Recomendação: No Wave 0, usar um placeholder (imagem de celular genérica ou PNG sólido verde). Após o modelo 3D estar pronto, tirar screenshot do canvas em desktop e exportar como WebP. O plano 06-01 deve incluir essa task explicitamente.

2. **Número do WhatsApp do nutricionista é conhecido?**
   - O que sabemos: Deve vir de `NEXT_PUBLIC_WHATSAPP_NUMBER` (env var) — D-11.
   - O que está incerto: O número real do nutricionista não está nos arquivos de planejamento.
   - Recomendação: Plano deve incluir placeholder `5500000000000` em `.env.local` e instrução para o usuário configurar o número real no Vercel dashboard.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tailwind.config.js para tokens | @theme {} no CSS | Tailwind v4 (jan 2025) | Sem arquivo JS de config; hot reload instantâneo |
| @next/font (pacote separado) | next/font (built-in) | Next.js 13.2 | Sem instalação adicional; zero CLS nativo |
| r3f v8 com React 18 | r3f v9 com React 19 | 2025 | Mudança de peer deps — não usar v8 com projeto novo |
| `pages/` Router | `app/` Router | Next.js 13+ | Server Components, layouts aninhados, SSG por padrão |

**Deprecated/outdated:**
- `@next/font`: substituído por `next/font` — não instalar separadamente.
- `tailwind.config.js` para tokens de cor: descontinuado em Tailwind v4 — usar `@theme {}`.
- `@react-three/fiber` v8: não compatível com React 19 — usar v9.

---

## Sources

### Primary (HIGH confidence)
- `nextjs.org/docs/app/api-reference/cli/create-next-app` — flags exatas do create-next-app, verificado em 2026-04-28
- `nextjs.org/docs/app/api-reference/components/font` — configuração Inter + Tailwind v4, verificado em 2026-04-28
- `r3f.docs.pmnd.rs/getting-started/installation` — setup Canvas + dynamic import ssr:false, verificado em 2026-04-28
- `drei.docs.pmnd.rs/staging/float` — props do componente Float, verificado em 2026-04-28
- `npm view` — versões de todos os pacotes verificadas em 2026-04-28

### Secondary (MEDIUM confidence)
- `tailwindcss.com/docs/theme` — sintaxe @theme {}, verificado via WebSearch com URL oficial
- `motion.dev/docs/react-scroll-animations` — whileInView + viewport + staggerChildren, verificado via WebSearch
- `vercel.com/docs/git/vercel-for-github` — auto-deploy GitHub, verificado via WebSearch

### Tertiary (LOW confidence)
- Exemplos de overlay HTML sobre Canvas r3f — baseados em padrão geral de posicionamento CSS absoluto; não há doc oficial específica para esse padrão

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas no npm registry em 2026-04-28
- Architecture: HIGH — padrões verificados na documentação oficial Next.js e r3f
- Pitfalls: HIGH (SSR/Three.js, NEXT_PUBLIC_), MEDIUM (chat overlay alignment)
- Tailwind v4 @theme: HIGH — verificado em tailwindcss.com
- Vercel deploy: HIGH — documentação oficial consultada

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 dias — stack estável, Next.js e r3f não têm breaking changes frequentes)
