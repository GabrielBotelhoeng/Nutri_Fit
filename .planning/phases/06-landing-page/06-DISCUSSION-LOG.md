# Phase 6: Landing Page - Discussion Log

> **Audit trail only.** Não usar como input para agentes de planejamento.
> Decisões capturadas em CONTEXT.md.

**Date:** 2026-04-28
**Phase:** 06-landing-page
**Areas discussed:** Hero 3D, Animações e scroll-reveal, Plano em destaque, Mobile — hero e performance

---

## Hero 3D — como anima e o que mostra

| Option | Description | Selected |
|--------|-------------|----------|
| react-three-fiber | Wrapper React para Three.js, melhor integração com Next.js | ✓ |
| Three.js standalone | Mais controle, mais verboso | |

**User's choice:** react-three-fiber

---

| Option | Description | Selected |
|--------|-------------|----------|
| Conversa animada em loop | Mensagens aparecem sequencialmente simulando uso real | ✓ |
| Screenshot estático | Imagem fixa, mais simples | |
| Logo + gradiente | Minimalista, sem narrativa de produto | |

**User's choice:** Conversa animada — mensagens aparecem em loop

---

| Option | Description | Selected |
|--------|-------------|----------|
| Flutua e rotaciona levemente em loop | Animação idle automática | ✓ |
| Parallax com scroll | Reage ao scroll do usuário | |
| Responde ao mouse (hover) | Inclina com o cursor | |

**User's choice:** Flutua e rotaciona levemente em loop

---

## Animações e scroll-reveal

| Option | Description | Selected |
|--------|-------------|----------|
| Framer Motion — fade-in sutil | Integração React, profissional | ✓ |
| CSS puro | Zero dependência, mais limitado | |
| Sem animações de scroll | Estático | |

**User's choice:** Framer Motion — fade-in sutil

---

## Plano em destaque

| Option | Description | Selected |
|--------|-------------|----------|
| 3 meses — R$ 222/mês | Equilíbrio preço/comprometimento | ✓ |
| 6 meses — R$ 130/mês | Melhor custo-benefício | |
| Nenhum — todos iguais | Visual limpo, converte menos | |

**User's choice:** 3 meses — R$ 222/mês

---

## Mobile — hero e performance

| Option | Description | Selected |
|--------|-------------|----------|
| Imagem estática no mobile | < 768px usa PNG/WebP, performance garantida | ✓ |
| Three.js em todos os dispositivos | Consistência visual, pode ser lento | |

**User's choice:** Imagem estática no mobile (< 768px)

---

## Claude's Discretion

- Layout da seção "Como funciona"
- Tipografia (Inter ou Geist)
- Conteúdo dos depoimentos placeholder
- Modelo 3D do celular

## Deferred Ideas

- Parallax com scroll no hero
- Three.js no mobile
