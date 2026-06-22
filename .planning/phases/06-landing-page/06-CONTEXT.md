# Phase 6: Landing Page - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Landing page do NutriChat: hero 3D animado (react-three-fiber), seções de conteúdo (Como funciona, Funcionalidades, Depoimentos), seção de planos com CTA para WhatsApp, rodapé, deploy automático na Vercel.

Esta fase **não** inclui: painel do nutricionista (Fase 5), backend, WhatsApp bot. É uma página estática/SSG sem autenticação.

</domain>

<decisions>
## Implementation Decisions

### Framework e Deploy
- **D-01:** **Next.js + Tailwind CSS** como stack principal. Repositório separado `nutrichat-landing`. Deploy automático na **Vercel** a partir do branch main (LANDING-08).
- **D-02:** Tailwind v4 (alinhado com o painel). Paleta de cores via CSS custom properties — reutilizar a mesma paleta definida no painel.

### Hero 3D
- **D-03:** Celular 3D implementado com **react-three-fiber** (não Three.js standalone). Melhor integração com Next.js/React, componentes declarativos, ecossistema drei disponível.
- **D-04:** A tela do celular exibe uma **conversa animada em loop** — mensagens do paciente e respostas do bot aparecem sequencialmente, simulando o NutriChat em ação. Não é screenshot estático.
- **D-05:** O celular **flutua e rotaciona levemente em loop automático** (animação idle). Sem parallax de scroll, sem follow-mouse. Sobe/desce suavemente + leve rotação no eixo Y.
- **D-06:** Fundo do hero: `#F0F7EC` (verde off-white). Celular pode ter reflexos em verde menta (`#C8E6C0`) para profundidade.

### Animações de Scroll
- **D-07:** **Framer Motion** para scroll-reveal. Elementos das seções entram com **fade-in + slide suave** ao aparecer na viewport. Tom: sutil e profissional — sem animações exageradas ou bounce.
- **D-08:** Apenas os elementos de conteúdo animam (cards, títulos de seção, itens de lista). Header e footer não animam.

### Seção de Planos
- **D-09:** O plano **3 meses (R$ 222/mês)** tem destaque visual: badge "Mais Popular", borda verde floresta (`#2D5016`), card levemente maior ou com shadow mais pronunciado.
- **D-10:** 4 cards de planos: 1 mês (R$ 330), 3 meses (R$ 222/mês — destaque), 6 meses (R$ 130/mês), 12 meses (R$ 89,90/mês).
- **D-11:** CTA de cada plano: link `https://wa.me/55XXXXXXXXXXX?text=...` com mensagem pré-preenchida: `"Olá! Tenho interesse no plano de [X meses] do Nutri Chat. Pode me passar mais informações?"`.

### Mobile — Hero e Performance
- **D-12:** Abaixo de **768px (md breakpoint)**, o canvas Three.js é **substituído por imagem estática** (PNG ou WebP do celular). react-three-fiber só renderiza em tablet/desktop (≥ 768px). Garante performance em smartphones antigos.
- **D-13:** A imagem estática mobile deve mostrar o mesmo celular do hero (render exportado ou screenshot do canvas 3D).

### Estrutura das Seções
- **D-14:** Ordem das seções (LANDING-02 a LANDING-06):
  1. Hero — celular 3D + headline + CTA
  2. Como funciona — 4 passos numerados (nutricionista cadastra → agente contata → paciente registra → relatório)
  3. Funcionalidades — registro por foto/áudio, alertas, relatório semanal
  4. Depoimentos — placeholders para portfólio (3-4 cards)
  5. Planos — 4 cards com preços e CTA WhatsApp
  6. Rodapé — contato e redes sociais do nutricionista

### Claude's Discretion
- Layout exato da seção "Como funciona" (timeline, grid de ícones ou steps numerados)
- Tipografia (font-family — pode usar Inter ou Geist, padrão Next.js)
- Número exato de itens na seção de Funcionalidades
- Conteúdo dos depoimentos placeholder
- Informações do rodapé (o número do WhatsApp do nutricionista virá de env var ou hardcoded no config)
- Modelo 3D do celular (pode ser GLB free ou modelo paramétrico em react-three-fiber)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da Fase 6
- `.planning/REQUIREMENTS.md` §LANDING — LANDING-01 a LANDING-08
- `.planning/ROADMAP.md` §Phase 6 — Goal, Success Criteria e Plans desta fase

### Projeto
- `.planning/PROJECT.md` — Stack, paleta de cores completa, estrutura da landing page, preços dos planos, fluxo de contratação via WhatsApp
- `PROJETO.md` — Documento original do projeto com identidade visual detalhada e combinações de cores recomendadas

### Código existente para referência de padrões
- `nutrichat-painel/src/index.css` — paleta de cores como CSS custom properties (--color-floresta, --color-offwhite, --color-terra) — replicar na landing
- `nutrichat-painel/src/components/StatusBadge.tsx` — padrão de badge visual com Tailwind

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Paleta Tailwind v4 do painel (`index.css`) — replicar as mesmas custom properties em `globals.css` da landing
- Nenhum componente do painel é reaproveitado diretamente (painel usa Vite+React, landing usa Next.js)

### Established Patterns
- Tailwind v4 com `@theme {}` para custom properties de cor
- TypeScript em todo o projeto
- Deploy containerizado no Railway (painel) e estático na Vercel (landing)

### Integration Points
- A landing page é **independente** do backend — sem chamadas de API
- O único link externo é o CTA para WhatsApp (`wa.me/...`)
- O número de WhatsApp do nutricionista deve ser configurável via env var (`NEXT_PUBLIC_WHATSAPP_NUMBER`)

</code_context>

<specifics>
## Specific Ideas

- Celular 3D do hero com animação idle (flutua + rotaciona levemente) em loop automático
- Conversa animada na tela do celular mostrando troca de mensagens reais (paciente + bot)
- Plano de 3 meses destacado com badge "Mais Popular"
- No mobile (< 768px): substituir canvas Three.js por imagem estática do celular
- Framer Motion para scroll-reveal sutil em todas as seções de conteúdo

</specifics>

<deferred>
## Deferred Ideas

- Animação parallax com scroll no hero — adiado (D-05 optou por animação idle simples)
- Three.js no mobile — descartado por performance (D-12)
- Página de detalhes de plano individual — fora do escopo v1
- Blog ou artigos de nutrição — fora do escopo desta fase

</deferred>

---

*Phase: 06-landing-page*
*Context gathered: 2026-04-28*
