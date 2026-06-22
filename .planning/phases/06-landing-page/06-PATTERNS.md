# Phase 6: Landing Page — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 10 (novos — repositório nutrichat-landing ainda não existe)
**Analogs found:** 3 / 10 (do painel existente) + padrões completos via RESEARCH.md para os demais

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `app/globals.css` | config | transform | `nutrichat-painel/src/index.css` | role-match (mesmo @theme Tailwind v4) |
| `app/layout.tsx` | config | request-response | — | no-analog (Next.js App Router — novo padrão) |
| `app/page.tsx` | component | request-response | — | no-analog (Server Component composição) |
| `components/Header.tsx` | component | event-driven | `nutrichat-painel/src/components/LoginForm.tsx` | partial (usa mesma paleta + bg offwhite) |
| `components/Hero.tsx` | component | request-response | — | no-analog (Three.js + dynamic import) |
| `components/PhoneCanvas.tsx` | component | event-driven | — | no-analog (react-three-fiber — nenhum no painel) |
| `components/HowItWorks.tsx` | component | request-response | `nutrichat-painel/src/components/PacienteModal.tsx` | partial (estrutura de grid + tokens de cor) |
| `components/Features.tsx` | component | request-response | `nutrichat-painel/src/components/StatusBadge.tsx` | partial (badge/card com Tailwind tokens) |
| `components/Plans.tsx` | component | event-driven | `nutrichat-painel/src/components/StatusBadge.tsx` | partial (badge "Mais Popular" = padrão badge pill) |
| `components/Footer.tsx` | component | request-response | `nutrichat-painel/src/components/LoginForm.tsx` | partial (bg floresta + texto offwhite) |
| `components/Testimonials.tsx` | component | request-response | `nutrichat-painel/src/components/PacienteModal.tsx` | partial (card branco + shadow) |

---

## Pattern Assignments

### `app/globals.css` (config, transform)

**Analog:** `nutrichat-painel/src/index.css` (linhas 1–11)

**Padrão @theme existente** (`nutrichat-painel/src/index.css` linhas 1–7):
```css
@import "tailwindcss";

@theme {
  --color-floresta: #2D5016;
  --color-offwhite: #F0F7EC;
  --color-terra: #6B3D1E;
}
```

**Padrão expandido para a landing** (replicar com paleta completa — UI-SPEC linha 90–101):
```css
@import "tailwindcss";

@theme {
  --color-floresta:  #2D5016;  /* Verde floresta — primário, CTAs, H1/H2 */
  --color-medio:     #4A7C2F;  /* Verde médio — hover, bordas, ícones */
  --color-claro:     #7DB85A;  /* Verde claro — badges, highlights */
  --color-menta:     #C8E6C0;  /* Verde menta — card bg, seções alternadas */
  --color-offwhite:  #F0F7EC;  /* Verde off-white — bg principal */
  --color-terra:     #6B3D1E;  /* Marrom terra — tipografia principal */
  --color-claro-br:  #A0694A;  /* Marrom claro — subtítulos, texto secundário */
  --color-creme:     #FAF4ED;  /* Creme — seção invertida bg */
  --color-branco:    #FFFFFF;  /* Branco — cards, formulários */

  --font-sans: var(--font-inter);
}

html {
  scroll-behavior: smooth;
}

* { box-sizing: border-box; }
body { margin: 0; }
```

> Nota: O painel usa apenas 3 tokens. A landing expande para 9 tokens conforme UI-SPEC. A sintaxe `@import "tailwindcss"` + `@theme {}` é idêntica — copiar exatamente.

---

### `app/layout.tsx` (config, request-response)

**Analog:** Sem analog no painel (painel usa Vite/React, não Next.js)

**Padrão via RESEARCH.md Pattern 3** (`06-RESEARCH.md` linhas 263–287):
```tsx
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata = {
  title: 'NutriChat — Seu assistente nutricional no WhatsApp',
  description: 'Acompanhamento nutricional inteligente via WhatsApp.',
}

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

> `--font-inter` é a custom property injetada pelo `next/font` que o `@theme { --font-sans: var(--font-inter) }` consome.

---

### `app/page.tsx` (component, request-response)

**Analog:** Sem analog próximo

**Padrão:** Server Component simples — composição das seções em ordem (D-14):
```tsx
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import HowItWorks from '@/components/HowItWorks'
import Features from '@/components/Features'
import Testimonials from '@/components/Testimonials'
import Plans from '@/components/Plans'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main>
      <Header />
      <Hero />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Plans />
      <Footer />
    </main>
  )
}
```

> Sem `'use client'` — este arquivo é Server Component por padrão no App Router.

---

### `components/Header.tsx` (component, event-driven)

**Analog:** `nutrichat-painel/src/components/LoginForm.tsx` linhas 20–24

**Padrão de cor extraído** (LoginForm.tsx linha 20):
```tsx
// Fundo offwhite + texto floresta — padrão idêntico para o nav sticky
<div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F7EC' }}>
  <span className="text-2xl font-bold" style={{ color: '#6B3D1E' }}>NutriChat</span>
```

**Padrão do Header para a landing** (adaptado para sticky nav + hamburger):
```tsx
'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5500000000000'

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: 'rgba(240,247,236,0.92)', backdropFilter: 'blur(8px)' }}
    >
      <div className="max-w-[1152px] mx-auto px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <span className="text-xl font-bold text-floresta">NutriChat</span>

        {/* Nav desktop */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#como-funciona" className="text-terra hover:text-floresta transition-colors">Como funciona</a>
          <a href="#funcionalidades" className="text-terra hover:text-floresta transition-colors">Funcionalidades</a>
          <a href="#planos" className="text-terra hover:text-floresta transition-colors">Planos</a>
          <a
            href={`https://wa.me/${phone}`}
            className="bg-floresta text-offwhite px-4 py-2 rounded-lg text-sm font-semibold hover:bg-medio transition-colors"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
          >
            Falar com nutricionista
          </a>
        </nav>

        {/* Hamburger mobile */}
        <button
          className="md:hidden p-2 text-floresta"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Drawer mobile — Framer Motion AnimatePresence */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 top-16 bg-offwhite z-40 flex flex-col gap-6 p-8 md:hidden"
          >
            {/* links + CTA */}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
```

---

### `components/Hero.tsx` (component, request-response)

**Analog:** Sem analog no painel para Three.js/dynamic import

**Padrão via RESEARCH.md Pattern 4** (`06-RESEARCH.md` linhas 294–344):
```tsx
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
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5500000000000'
  const waText = encodeURIComponent('Olá! Quero começar com o NutriChat.')

  return (
    <section className="bg-offwhite min-h-screen flex items-center py-16">
      <div className="max-w-[1152px] mx-auto px-8 grid md:grid-cols-2 gap-8 items-center">

        {/* Texto */}
        <div>
          <h1 className="text-floresta font-bold text-5xl leading-[1.15] mb-4">
            Seu paciente acompanhado. Você tranquilo.
          </h1>
          <p className="text-claro-br text-lg mb-8">
            O NutriChat cuida do acompanhamento nutricional no WhatsApp —
            registro de refeições, alertas e relatórios automáticos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={`https://wa.me/${phone}?text=${waText}`}
              className="bg-floresta text-offwhite px-6 py-3 rounded-lg font-semibold hover:bg-medio transition-colors text-center"
              style={{ minHeight: '44px' }}
            >
              Quero começar agora
            </a>
            <a
              href="#como-funciona"
              className="border border-floresta text-floresta px-6 py-3 rounded-lg font-semibold hover:bg-menta transition-colors text-center"
              style={{ minHeight: '44px' }}
            >
              Como funciona
            </a>
          </div>
        </div>

        {/* Canvas 3D — apenas md+ (D-12) */}
        <div className="hidden md:block h-[480px]">
          <PhoneCanvas />
        </div>

        {/* Imagem estática mobile — apenas < md (D-13) */}
        <div className="block md:hidden mt-8">
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

---

### `components/PhoneCanvas.tsx` (component, event-driven)

**Analog:** Sem analog — nenhum componente r3f no painel

**Padrão via RESEARCH.md Pattern 5** (`06-RESEARCH.md` linhas 352–448):
```tsx
'use client'
import { Canvas } from '@react-three/fiber'
import { Float, RoundedBox } from '@react-three/drei'
import { useState, useEffect } from 'react'

const CHAT_MESSAGES = [
  { from: 'user', text: 'Oi! Acabei de almoçar 🍽️', delay: 0 },
  { from: 'bot',  text: 'Ótimo! Me conta o que você comeu?', delay: 800 },
  { from: 'user', text: 'Arroz, frango grelhado e salada', delay: 1600 },
  { from: 'bot',  text: 'Registrado! ✅ 520kcal. Faltam 880kcal para a meta.', delay: 2400 },
  { from: 'user', text: 'Perfeito, obrigado!', delay: 3200 },
]
const LOOP_DURATION = 5000

function Phone() {
  return (
    <group>
      <RoundedBox args={[1.2, 2.4, 0.12]} radius={0.12} smoothness={4}>
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.6} />
      </RoundedBox>
      <RoundedBox args={[1.0, 2.0, 0.01]} radius={0.06} position={[0, 0, 0.07]}>
        <meshStandardMaterial color="#0a2a0a" roughness={0.1} />
      </RoundedBox>
    </group>
  )
}

export default function PhoneCanvas() {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    let timeouts: ReturnType<typeof setTimeout>[] = []
    function scheduleMessages() {
      setVisibleCount(0)
      CHAT_MESSAGES.forEach((msg, i) => {
        const t = setTimeout(() => setVisibleCount(i + 1), msg.delay)
        timeouts.push(t)
      })
      const loop = setTimeout(scheduleMessages, LOOP_DURATION)
      timeouts.push(loop)
    }
    scheduleMessages()
    return () => timeouts.forEach(clearTimeout)
  }, [])

  return (
    <div className="relative w-full h-full">
      <Canvas camera={{ position: [0, 0, 4], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3} floatingRange={[-0.15, 0.15]}>
          <Phone />
        </Float>
      </Canvas>

      {/* Chat overlay HTML sobre o canvas (não CanvasTexture) */}
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
                  ? 'self-end bg-floresta text-offwhite'
                  : 'self-start bg-branco text-terra'
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

> CRÍTICO: Este arquivo NUNCA deve ser importado diretamente em Server Components. Sempre usar `dynamic(() => import('./PhoneCanvas'), { ssr: false })` em Hero.tsx.

---

### `components/HowItWorks.tsx` (component, request-response)

**Analog:** `nutrichat-painel/src/components/PacienteModal.tsx` linhas 88–96 (estrutura de grid + heading + cores)

**Padrão de heading + cor extraído** (PacienteModal.tsx linha 92):
```tsx
<h2 className="text-lg font-bold" style={{ color: '#6B3D1E' }}>
  {isEdicao ? 'Editar Paciente' : 'Novo Paciente'}
</h2>
```

**Padrão de cards com Framer Motion via RESEARCH.md Pattern 6** (`06-RESEARCH.md` linhas 456–499):
```tsx
'use client'
import { motion } from 'framer-motion'
import { UserPlus, MessageCircle, Camera, BarChart2 } from 'lucide-react'

// Variante reutilizável — definida uma vez, usada em todos os componentes animados
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
}

const STEPS = [
  { num: 1, icon: UserPlus,       title: 'Nutricionista cadastra',         desc: '...' },
  { num: 2, icon: MessageCircle,  title: 'Agente contata o paciente',      desc: '...' },
  { num: 3, icon: Camera,         title: 'Paciente registra refeições',    desc: '...' },
  { num: 4, icon: BarChart2,      title: 'Relatório semanal automático',   desc: '...' },
]

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 bg-offwhite">
      <div className="max-w-[1152px] mx-auto px-8">
        <h2 className="text-floresta font-bold text-3xl text-center mb-12">
          Simples para o nutricionista, poderoso para o paciente
        </h2>
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {STEPS.map((step) => (
            <motion.div
              key={step.num}
              variants={fadeInUp}
              className="bg-branco border border-menta rounded-xl p-6 flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-200"
            >
              <div className="w-10 h-10 rounded-full bg-floresta text-offwhite flex items-center justify-center font-bold text-lg">
                {step.num}
              </div>
              <step.icon size={24} className="text-medio" />
              <h3 className="font-bold text-terra">{step.title}</h3>
              <p className="text-sm text-claro-br leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
```

---

### `components/Features.tsx` (component, request-response)

**Analog:** `nutrichat-painel/src/components/StatusBadge.tsx` linhas 1–18

**Padrão de card com config object extraído** (StatusBadge.tsx linhas 5–8):
```tsx
// Padrão de config object por item — replicar para cards de funcionalidades
const badgeConfig = {
  ativo:     { label: 'Ativo',     classes: 'bg-green-100 text-green-800' },
  expirando: { label: 'Expirando', classes: 'bg-yellow-100 text-yellow-800' },
  expirado:  { label: 'Expirado',  classes: 'bg-red-100 text-red-800' },
};
```

**Padrão de inline-flex badge** (StatusBadge.tsx linha 14):
```tsx
<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
```

**Adaptação para Features** (6 cards com stagger — mesmo padrão fadeInUp de HowItWorks):
```tsx
'use client'
import { motion } from 'framer-motion'
import { Image, Mic, Bell, FileText, Calculator, Repeat } from 'lucide-react'

// Reutilizar fadeInUp e staggerContainer de HowItWorks (extrair para lib/animations.ts)

const FEATURES = [
  { icon: Image,      title: 'Registro por foto',          desc: '...' },
  { icon: Mic,        title: 'Registro por áudio',         desc: '...' },
  { icon: Bell,       title: 'Alertas inteligentes',       desc: '...' },
  { icon: FileText,   title: 'Relatório semanal',          desc: '...' },
  { icon: Calculator, title: 'Cálculo de macros',          desc: '...' },
  { icon: Repeat,     title: 'Substituição de alimentos',  desc: '...' },
]

export default function Features() {
  return (
    <section id="funcionalidades" className="py-16 bg-offwhite">
      <div className="max-w-[1152px] mx-auto px-8">
        <h2 className="text-floresta font-bold text-3xl text-center mb-12">
          Tudo que seu paciente precisa, no WhatsApp que ele já usa
        </h2>
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {FEATURES.map((feat, i) => (
            <motion.div
              key={i}
              variants={fadeInUp}
              className="bg-branco border border-menta rounded-xl p-6 flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-200"
            >
              <feat.icon size={28} className="text-medio" />
              <h3 className="font-bold text-terra">{feat.title}</h3>
              <p className="text-sm text-claro-br leading-relaxed">{feat.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
```

---

### `components/Testimonials.tsx` (component, request-response)

**Analog:** `nutrichat-painel/src/components/PacienteModal.tsx` linhas 88–96 (card bg-white + rounded-xl + shadow)

**Padrão de card branco extraído** (PacienteModal.tsx linha 90):
```tsx
<div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
```

**Adaptação para Testimonials** (bg de seção menta — seção alternada):
```tsx
'use client'
import { motion } from 'framer-motion'

const TESTIMONIALS = [
  { name: 'Maria S., 32 anos', text: 'Em 3 semanas já perdi 2kg. O bot me lembra de tudo e ainda calcula o que eu como em segundos.' },
  { name: 'João P., 28 anos',  text: 'Nunca consegui seguir uma dieta antes. Com o NutriChat ficou fácil porque é tudo pelo WhatsApp mesmo.' },
  { name: 'Ana C., 41 anos',   text: 'Minha nutricionista consegue ver tudo que comi durante a semana. O acompanhamento melhorou muito.' },
]

export default function Testimonials() {
  return (
    <section className="py-16 bg-menta">
      <div className="max-w-[1152px] mx-auto px-8">
        <h2 className="text-floresta font-bold text-3xl text-center mb-4">
          O que nossos pacientes dizem
        </h2>
        <p className="text-claro-br text-center mb-12">
          Resultados reais de pessoas acompanhadas pelo NutriChat
        </p>
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              variants={fadeInUp}
              className="bg-branco rounded-xl p-6"
              style={{ boxShadow: '0 2px 12px rgba(45,80,22,0.08)' }}
            >
              {/* Avatar placeholder */}
              <div className="w-10 h-10 rounded-full bg-menta mb-4" />
              <p className="text-terra text-sm leading-relaxed mb-4">"{t.text}"</p>
              <span className="text-claro-br text-xs font-medium">{t.name}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
```

---

### `components/Plans.tsx` (component, event-driven)

**Analog:** `nutrichat-painel/src/components/StatusBadge.tsx` linhas 11–17 (padrão badge pill com rounded-full)

**Padrão de badge pill extraído** (StatusBadge.tsx linhas 14–16):
```tsx
<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
  {label}
</span>
```

**Padrão CTA WhatsApp via RESEARCH.md Pattern 7** (`06-RESEARCH.md` linhas 507–522):
```tsx
const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5500000000000'

function waLink(months: number) {
  const text = encodeURIComponent(
    `Olá! Tenho interesse no plano de ${months} ${months === 1 ? 'mês' : 'meses'} do Nutri Chat. Pode me passar mais informações?`
  )
  return `https://wa.me/${phone}?text=${text}`
}
```

**Padrão completo do card de plano** (com badge "Mais Popular"):
```tsx
'use client'
import { motion } from 'framer-motion'

const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5500000000000'

const PLANS = [
  { months: 1,  price: 'R$ 330',     perMonth: '/mês',    featured: false },
  { months: 3,  price: 'R$ 222',     perMonth: '/mês',    featured: true  },
  { months: 6,  price: 'R$ 130',     perMonth: '/mês',    featured: false },
  { months: 12, price: 'R$ 89,90',   perMonth: '/mês',    featured: false },
]

export default function Plans() {
  return (
    <section id="planos" className="py-16 bg-offwhite">
      <div className="max-w-[1152px] mx-auto px-8">
        <h2 className="text-floresta font-bold text-3xl text-center mb-4">Escolha o plano ideal</h2>
        <p className="text-claro-br text-center mb-16">Acesso completo ao NutriChat. Sem apps para instalar.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.months}
              className={`relative bg-branco rounded-xl p-6 flex flex-col gap-4 transition-transform duration-200 hover:-translate-y-1 ${
                plan.featured
                  ? 'lg:scale-105 border-2 border-floresta'
                  : 'border border-menta'
              }`}
              style={plan.featured
                ? { boxShadow: '0 8px 32px rgba(45,80,22,0.16)' }
                : {}
              }
            >
              {/* Badge "Mais Popular" — posição absolute, pill */}
              {plan.featured && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 bg-floresta text-offwhite text-xs font-bold rounded-full whitespace-nowrap"
                  style={{ padding: '4px 12px' }}
                >
                  Mais Popular
                </span>
              )}

              <h3 className="font-bold text-terra text-lg">{plan.months} {plan.months === 1 ? 'mês' : 'meses'}</h3>
              <div>
                <span className={`font-bold text-floresta ${plan.featured ? 'text-4xl' : 'text-2xl'}`}>
                  {plan.price}
                </span>
                <span className="text-claro-br text-sm">{plan.perMonth}</span>
              </div>

              <a
                href={waLink(plan.months)}
                className="mt-auto w-full bg-floresta text-offwhite py-3 rounded-lg text-center text-sm font-semibold hover:bg-medio transition-colors"
                style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Quero esse plano
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function waLink(months: number) {
  const text = encodeURIComponent(
    `Olá! Tenho interesse no plano de ${months} ${months === 1 ? 'mês' : 'meses'} do Nutri Chat. Pode me passar mais informações?`
  )
  return `https://wa.me/${phone}?text=${text}`
}
```

---

### `components/Footer.tsx` (component, request-response)

**Analog:** `nutrichat-painel/src/components/LoginForm.tsx` linhas 44–50

**Padrão de botão/fundo floresta extraído** (LoginForm.tsx linhas 44–50):
```tsx
<button
  type="submit"
  disabled={loading}
  className="w-full py-2 rounded text-white font-semibold disabled:opacity-60 cursor-pointer"
  style={{ background: '#2D5016' }}
>
  {loading ? 'Entrando...' : 'Entrar'}
</button>
```

**Padrão do Footer** (bg floresta + texto offwhite — UI-SPEC linha 197–201):
```tsx
export default function Footer() {
  return (
    <footer className="bg-floresta text-offwhite py-12">
      <div className="max-w-[1152px] mx-auto px-8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          <div>
            <span className="text-xl font-bold">NutriChat</span>
            <p className="text-sm mt-2 opacity-80">Seu assistente nutricional inteligente no WhatsApp</p>
          </div>
          <div className="flex gap-6 text-sm">
            <a href="mailto:contato@nutrichat.com" className="hover:text-claro transition-colors">Contato</a>
            <a href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}`} className="hover:text-claro transition-colors">WhatsApp</a>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-white/20 text-sm opacity-60">
          © 2026 NutriChat
        </div>
      </div>
    </footer>
  )
}
```

---

## Shared Patterns

### Paleta de Cores (Tailwind v4 tokens)
**Source:** `nutrichat-painel/src/index.css` linhas 1–7 (expandida pela UI-SPEC)
**Aplicar em:** `app/globals.css` — todos os outros arquivos consomem via classes `text-floresta`, `bg-menta`, etc.

```css
/* Tokens expandidos — painel usa só 3, landing usa 9 */
--color-floresta:  #2D5016;
--color-medio:     #4A7C2F;
--color-claro:     #7DB85A;
--color-menta:     #C8E6C0;
--color-offwhite:  #F0F7EC;
--color-terra:     #6B3D1E;
--color-claro-br:  #A0694A;
--color-creme:     #FAF4ED;
--color-branco:    #FFFFFF;
```

### Animações Framer Motion (reutilizar em todos os componentes animados)
**Source:** RESEARCH.md Pattern 6 + UI-SPEC linha 218–222
**Aplicar em:** HowItWorks.tsx, Features.tsx, Testimonials.tsx, Plans.tsx
**Recomendação:** Extrair para `lib/animations.ts` para evitar duplicação.

```ts
// lib/animations.ts
export const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
}

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
}
```

### CTA WhatsApp com env var
**Source:** RESEARCH.md Pattern 7 (`06-RESEARCH.md` linhas 507–522)
**Aplicar em:** Header.tsx, Hero.tsx, Plans.tsx
**Recomendação:** Extrair função `waLink()` para `lib/whatsapp.ts`.

```ts
// lib/whatsapp.ts
export function waLink(months?: number): string {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5500000000000'
  const text = months
    ? encodeURIComponent(`Olá! Tenho interesse no plano de ${months} ${months === 1 ? 'mês' : 'meses'} do Nutri Chat. Pode me passar mais informações?`)
    : encodeURIComponent('Olá! Quero começar com o NutriChat.')
  return `https://wa.me/${phone}?text=${text}`
}
```

### Hover lift em cards
**Source:** UI-SPEC linha 213 — padrão CSS uniforme para todos os cards
**Aplicar em:** HowItWorks.tsx, Features.tsx, Testimonials.tsx, Plans.tsx

```tsx
className="... hover:-translate-y-1 transition-transform duration-200"
```

### Touch targets mínimos (44px)
**Source:** UI-SPEC spacing scale — WCAG 2.5.5
**Aplicar em:** Todos os botões e links CTA em Header.tsx, Hero.tsx, Plans.tsx

```tsx
style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
```

### Container centralizado
**Source:** UI-SPEC linha 263–267
**Aplicar em:** Todos os componentes de seção

```tsx
className="max-w-[1152px] mx-auto px-8"
// mobile: px-4 (32px total = 100% - 32px)
// tablet md: px-6
// desktop: px-8 (80px = container-desktop token)
```

---

## No Analog Found

Arquivos sem correspondente no codebase existente (planner deve usar RESEARCH.md):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/layout.tsx` | config | request-response | Next.js App Router — painel usa Vite/React |
| `app/page.tsx` | component | request-response | Server Component — painel não usa Next.js |
| `components/PhoneCanvas.tsx` | component | event-driven | react-three-fiber — nenhum componente 3D no painel |
| `lib/animations.ts` | utility | transform | Sem utilitários Framer Motion no painel |
| `lib/whatsapp.ts` | utility | transform | Sem links wa.me no painel |
| `public/hero-phone-static.webp` | static asset | — | Asset novo — screenshot do canvas 3D após finalização |

---

## Notas de Implementação para o Planner

1. **Ordem de criação:** globals.css → layout.tsx → lib/* → PhoneCanvas.tsx → componentes por seção → page.tsx
2. **'use client' obrigatório em:** Header.tsx (useState menuOpen), Hero.tsx (dynamic import), PhoneCanvas.tsx (Canvas r3f), HowItWorks.tsx, Features.tsx, Testimonials.tsx, Plans.tsx (todos usam motion)
3. **'use client' proibido em:** app/layout.tsx, app/page.tsx — devem permanecer Server Components
4. **postcss.config.mjs:** Gerado pelo `create-next-app --tailwind` — não recriar manualmente
5. **hero-phone-static.webp:** Usar placeholder temporário no Wave 0; substituir por screenshot real após PhoneCanvas estar pronto

---

## Metadata

**Analog search scope:** `nutrichat-painel/src/` (único subprojeto existente com código TypeScript + Tailwind)
**Files scanned:** 4 (index.css, StatusBadge.tsx, LoginForm.tsx, PacienteModal.tsx)
**Pattern extraction date:** 2026-04-28
**Note:** Repositório `nutrichat-landing` não existe ainda — todos os padrões são extraídos do `nutrichat-painel` para reutilização de tokens/estilos, ou da RESEARCH.md para padrões sem analog.
