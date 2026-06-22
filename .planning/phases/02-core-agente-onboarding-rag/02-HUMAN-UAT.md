---
status: partial
phase: 02-core-agente-onboarding-rag
source: [02-VERIFICATION.md]
started: 2026-04-23T23:59:00Z
updated: 2026-04-23T23:59:00Z
---

## Current Test

[aguardando testes humanos]

## Tests

### 1. Fluxo WhatsApp Completo — Onboarding
expected: Bot responde com "Ola, [Nome]! Sou o NutriChat..." seguido da pergunta 1 (idade). Supabase mostra paciente com entrevista_status='em_andamento' e entrevista_etapa=1.
result: [pending]

### 2. Entrevista Sequencial — 7 Etapas
expected: Agente avanca etapa a etapa; resposta invalida repete a pergunta sem avancar; apos etapa 7 envia 3 mensagens: confirmacao + calculos TMB/hidratacao/creatina + instrucoes. Supabase mostra entrevista_status='completa' com tmb_kcal, tdee_kcal, hidratacao_ml, creatina_g em entrevista_dados.
result: [pending]

### 3. POST /api/boas-vindas/:pacienteId — Disparo Externo
expected: Retorna 202 imediatamente; paciente recebe boas-vindas no WhatsApp em segundos; entrevista_status muda para em_andamento.
result: [pending]

### 4. Pipeline RAG End-to-End
expected: POST /api/rag/processar retorna 202; chunks criados em dieta_chunks; ao perguntar sobre dieta, agente responde com base no PDF (RAG presente na resposta Claude).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
