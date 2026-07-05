# NutriChat — Contexto Rápido para Claude

> **➡️ Handoff atual:** [`.planning/NEXT-SESSION.md`](.planning/NEXT-SESSION.md) — leia esse arquivo primeiro para saber o que já foi feito e o que falta. As seções "Fases GSD" e "Próxima ação" abaixo estão desatualizadas (mantidas por contexto histórico).

## O que é este projeto

NutriChat é um assistente nutricional via WhatsApp. O nutricionista cadastra o paciente no sistema, o bot inicia onboarding automático (entrevista de 7 etapas), calcula TMB/hidratação/creatina e responde dúvidas sobre a dieta via Claude AI + RAG (PDF da dieta indexado no pgvector).

## Stack

- **Backend**: Node.js/Express + TypeScript (`/backend`)
- **Banco**: Supabase Cloud (pgvector) — projeto `iqpoohthfhmjkvrqxzns`
- **WhatsApp**: Evolution API v2.3.7 (Docker local, porta 8081)
- **Workflows**: N8N (Docker local, porta 5678)
- **AI**: Claude Sonnet 4.6 (Anthropic) + Groq Whisper + OpenAI text-embedding-3-small

## Estado das Fases GSD

| Fase | Descrição | Status |
|------|-----------|--------|
| 01 | Infraestrutura + Docker + Evolution API + N8N | ✅ COMPLETA |
| 02 | Core Agente — Onboarding + RAG | ✅ COMPLETA (código verificado, testes UAT pendentes) |
| 03-07 | Áudios, Imagens, Dashboard, Pagamentos, Deploy | ⏳ Pendente |

## Como retomar o trabalho

**Próxima ação**: Continuar testes UAT da Fase 2 (o usuário está respondendo a entrevista pelo WhatsApp real), depois iniciar Fase 3 com `/gsd-execute-phase 3`

Antes de qualquer trabalho, confirmar que Docker está rodando:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```
Deve mostrar 5 containers: `nutrichat_backend`, `nutrichat_evolution`, `nutrichat_n8n`, `nutrichat_redis`, `nutrichat_postgres`.

**ATENÇÃO**: Após editar qualquer arquivo TypeScript do backend, fazer `docker restart nutrichat_backend` — o `tsx watch` no Docker (Windows) não detecta mudanças de volume automaticamente. Sem o restart, o código antigo continua rodando.

## Infraestrutura Local (Docker)

| Serviço | URL | Notas |
|---------|-----|-------|
| Evolution API | `http://localhost:8081` | Retorna JSON (normal). Manager em `/manager/` com API key `nutrichat_local_key` |
| N8N | `http://localhost:5678` | Login: botelhog45@gmail.com / NutriChat2026! |
| Backend | `http://localhost:3001` | Webhook em `/api/webhook` |
| Postgres | `localhost:5432` | user: postgres / senha: postgres |

## Arquitetura do Fluxo de Mensagens

```
WhatsApp → Evolution API → Backend POST /api/webhook → agentService → Evolution API (resposta)
```

**IMPORTANTE**: O webhook da Evolution API aponta DIRETAMENTE para `http://backend:3001/api/webhook` (dentro da rede Docker). O N8N NÃO está no fluxo de mensagens.

## Bugs Corrigidos Nesta Sessão (2026-04-24)

1. **N8N stub não encaminhava** → webhook Evolution API agora vai direto para `http://backend:3001/api/webhook`
2. **N8N senha perdida** → resetada via postgres para `NutriChat2026!`
3. **Evolution API cache de webhook** → após atualizar DB, precisou `docker restart nutrichat_evolution`
4. **Evento errado**: Evolution API v2 usa `messages.upsert` (não `MESSAGES_UPSERT`) → corrigido em `backend/src/routes/webhook.ts:32`
5. **Número BR com/sem 9**: WhatsApp envia `556295514963` (12 dígitos), BD tem `5562995514963` (13 dígitos) → corrigido em `backend/src/services/conversation.ts` com `normalizarWhatsapp()`
6. **tsx watch não recarrega no Docker/Windows** → sempre fazer `docker restart nutrichat_backend` após editar arquivos TypeScript

## Instância WhatsApp

- Nome: `nutrichat`
- ID: `b7b25ceb-3b79-4527-ac09-fc92da65d6ac`
- API Key: `nutrichat_local_key`
- Número do bot: `5562992058735` (conectado, status: open)
- Webhook configurado: `http://backend:3001/api/webhook`
- Eventos: `MESSAGES_UPSERT`, `CONNECTION_UPDATE`

## Paciente de Teste no Supabase

| Nome | WhatsApp (BD) | WhatsApp (real WA) | Status | Etapa | Dados |
|------|--------------|---------------------|--------|-------|-------|
| Gabriel Botelho De Siqueira | 5562995514963 | 556295514963 | em_andamento | 4 | idade=25, sexo=masculino, peso_kg=80 |

O bot está aguardando a resposta da **etapa 4 (altura em cm)**.

## Credenciais (não commitar)

Todas as chaves estão em `.env` (raiz do projeto). O docker-compose lê este arquivo.

- Supabase URL: `https://iqpoohthfhmjkvrqxzns.supabase.co`
- Evolution API Key: `nutrichat_local_key`
- N8N API JWT: ver `.env`
- Claude API Key: ver `.env`
- OpenAI API Key: ver `.env` (para embeddings RAG)
- Groq API Key: ver `.env` (para Whisper — Fase 3)

## Planos GSD

Ficam em `.planning/phases/`. Cada fase tem:
- `XX-01-PLAN.md`, `XX-02-PLAN.md` etc. — planos detalhados
- `XX-VERIFICATION.md` — verificação de completude
- `XX-HUMAN-UAT.md` — testes que precisam do WhatsApp real
