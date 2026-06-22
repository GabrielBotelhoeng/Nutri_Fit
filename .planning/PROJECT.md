# NutriChat — Project Context

**Initialized:** 2026-04-22
**Status:** Greenfield — Ready for planning
**Language:** pt-BR

---

## What This Is

Plataforma de assistente nutricional composta por três partes integradas:

1. **Nutri Chat** — Agente de IA no WhatsApp que acompanha a dieta do paciente de forma personalizada e automatizada, já conhecendo a dieta em PDF antes do primeiro contato.
2. **Painel do Nutricionista** — Interface web simples onde o nutricionista cadastra pacientes, faz upload de dietas e controla planos.
3. **Landing Page** — Página de apresentação do produto com celular 3D animado e seção de planos.

**Objetivo imediato:** Portfólio (LinkedIn + GitHub). Pronto para venda real se houver interesse de nutricionista.

---

## Core Value

**O paciente abre o WhatsApp e o agente já sabe tudo sobre a dieta dele, sem precisar perguntar.** O registro de refeições, alertas, cálculos e relatórios acontecem de forma natural, como conversar com um assistente que acompanha de verdade.

---

## Stack

| Parte | Tecnologia | Hospedagem |
|-------|-----------|-----------|
| Landing Page | Next.js + Three.js + Tailwind | Vercel |
| Backend / API | Node.js + Express | Railway |
| Banco de dados | Supabase (Postgres + Storage + pgvector) | Supabase Cloud |
| WhatsApp | Evolution API | Railway |
| Orquestração | N8N | Railway |
| IA principal | Claude API (claude-sonnet-4-6) | Anthropic |
| Transcrição de áudio | Whisper via Groq | Groq Cloud |
| RAG da dieta | LangChain + Supabase pgvector | — |
| Código de barras | Open Food Facts API | — |

---

## Requirements

### Validated
*(None yet — ship to validate)*

### Active

**Nutri Chat (Agente WhatsApp):**
- [ ] Receber webhook do Evolution API e rotear por tipo de mídia (texto/áudio/imagem)
- [ ] Transcrição de áudio via Groq Whisper
- [ ] Análise de imagem (foto de prato, código de barras, rótulo nutricional) via Claude Vision
- [ ] RAG da dieta: PDF → pgvector → contexto do agente
- [ ] Entrevista inicial (coleta de dados físicos, atividade, suplementos)
- [ ] Cálculo de TMB, hidratação diária e dose de suplementos
- [ ] Registro de refeições (texto, áudio, foto, código de barras, rótulo)
- [ ] Estimativa de porção por foto (2 ângulos) com aviso de limitação
- [ ] Confirmação antes de registrar alimento identificado por foto
- [ ] Sugestão de substituições apenas da dieta prescrita
- [ ] Cálculo e exibição de macros + kcal (consumido vs meta) por refeição
- [ ] Alertas agendados de refeição, água e suplementos (cron jobs N8N)
- [ ] Aviso 3 dias antes da expiração do plano
- [ ] Bloqueio automático no vencimento do plano
- [ ] Relatório semanal todo domingo

**Painel do Nutricionista:**
- [ ] Login seguro com Supabase Auth
- [ ] Cadastro de paciente: nome + WhatsApp + plano + data de expiração
- [ ] Upload de PDF da dieta
- [ ] Disparo automático de mensagem de boas-vindas ao cadastrar paciente
- [ ] Listagem de pacientes com status de plano (ativo/expirado)
- [ ] Ativar/desativar acesso manual

**Landing Page:**
- [ ] Hero com celular 3D animado (Three.js) simulando o Nutri Chat
- [ ] Seção "Como funciona" com exemplos visuais
- [ ] Seção de funcionalidades (foto de prato, áudio, alertas, relatório)
- [ ] Seção de depoimentos
- [ ] Cards de planos com CTA (link WhatsApp com mensagem pré-preenchida)
- [ ] Rodapé com contato e redes sociais
- [ ] Deploy na Vercel

### Out of Scope (v1)

- Pagamento online automático — contratação manual via WhatsApp
- App mobile dedicado — WhatsApp nativo é o canal
- Multi-nutricionista (SaaS) — produto para nutricionista individual
- Evolução automática de plano/dieta pelo agente — nutricionista ajusta manualmente

---

## Key Decisions

| Decisão | Racional | Status |
|---------|----------|--------|
| N8N como orquestrador | Workflows visuais, fácil iterar, sem código adicional | Definido |
| Evolution API para WhatsApp | Open source, melhor do mercado, sem mensalidade da Meta | Definido |
| Claude API (Sonnet) como IA | Contexto longo, visão, áudio — ideal para o caso de uso | Definido |
| Supabase como banco + storage | BD + storage PDF + pgvector gratuito em um só lugar | Definido |
| Railway para backend/N8N | Simples, barato, sem dor de VPS | Definido |
| API key separada do Claude Pro | Pro para desenvolvimento, API key para o produto | Definido |
| Substituições apenas da dieta prescrita | Segurança nutricional — agente não inventa | Definido |
| Confirmação antes de registrar foto | Precisão — agente só afirma com 100% de certeza | Definido |

---

## Identity

**Paleta de cores:**
- Verde floresta `#2D5016` — primária, CTAs
- Verde médio `#4A7C2F` — hover, bordas
- Verde claro `#7DB85A` — destaques, badges
- Verde menta `#C8E6C0` — backgrounds de cards
- Verde off-white `#F0F7EC` — background principal
- Marrom terra `#6B3D1E` — tipografia principal
- Marrom claro `#A0694A` — subtítulos
- Creme `#FAF4ED` — seções alternadas

**Planos:** 1 mês (R$330), 3 meses (R$222/mês), 6 meses (R$130/mês), 12 meses (R$89,90/mês)

---

## Repositories

| Repo | Stack | Deploy |
|------|-------|--------|
| `nutrichat-backend` | Node.js + Express + Supabase | Railway |
| `nutrichat-landing` | Next.js + Three.js + Tailwind | Vercel |
| `nutrichat-workflows` | N8N exports + Evolution API configs | Railway |

---

## Evolution

Este documento evolui a cada transição de fase e milestone.

**Após cada transição de fase** (via `/gsd-transition`):
1. Requisitos invalidados? → Mover para Out of Scope com motivo
2. Requisitos validados? → Mover para Validated com referência da fase
3. Novos requisitos emergiram? → Adicionar em Active
4. Decisões para registrar? → Adicionar em Key Decisions

---

*Last updated: 2026-04-22 após inicialização*
