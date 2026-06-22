---
phase: 02-core-agente-onboarding-rag
plan: "02-02"
subsystem: rag
tags: [rag, pgvector, langchain, openai-embeddings, pdf-parse, supabase, typescript]

requires:
  - phase: 02-core-agente-onboarding-rag
    plan: 02-01
    provides: "Router central /api + webhook funcional"
  - phase: 01-infraestrutura-ambiente
    provides: "Supabase com pgvector habilitado (migration 002)"

provides:
  - "Tabela dieta_chunks com embedding vector(1536) e index HNSW"
  - "Funcao match_chunks_paciente para busca semantica por paciente_id"
  - "ragService.processarDieta() — indexa PDF em chunks com embeddings OpenAI"
  - "ragService.query() — busca semantica coseno para perguntas do paciente"
  - "POST /api/rag/processar — dispara indexacao em background com resposta 202"

affects:
  - 02-03 (agente Claude usara ragService.query() para responder com contexto da dieta)

tech-stack:
  added:
    - "@langchain/openai@^0.3.0 — OpenAIEmbeddings text-embedding-3-small"
    - "langchain@^0.3.0 — RecursiveCharacterTextSplitter"
    - "@langchain/community@^0.3.0 — dependencia LangChain"
    - "pdf-parse@^1.1.1 — extracao de texto de PDF em buffer"
  patterns:
    - "Embeddings em lotes de 20 para evitar rate limit OpenAI"
    - "Fire-and-forget no /rag/processar: 202 imediato, indexacao em background"
    - "Idempotencia: DELETE chunks anteriores antes de re-inserir"
    - "Busca semantica via Supabase RPC com threshold configuravel"

key-files:
  created:
    - supabase/migrations/20260423000005_dieta_chunks.sql
    - backend/src/services/rag.ts
    - backend/src/routes/rag.ts
  modified:
    - backend/src/routes/api.ts
    - backend/src/config/env.ts
    - backend/.env.example
    - backend/package.json

key-decisions:
  - "match_chunks_paciente como nova funcao RPC (nao reutilizar match_dieta_chunks de migration 002 que opera em dietas.embedding, nao em chunks)"
  - "Lotes de 20 chunks para embeddings — balanco entre velocidade e respeito ao rate limit OpenAI"
  - "processarDieta idempotente: deleta chunks anteriores antes de re-inserir para suportar re-processamento sem duplicatas"
  - "threshold 0.6 em query() vs 0.7 default em match_chunks_paciente — query usa threshold menor para maior recall"

duration: 12min
completed: "2026-04-23"
---

# Phase 2 Plan 02: Pipeline RAG — PDF para pgvector — Summary

**Pipeline RAG completo: PDF da dieta baixado do Supabase Storage, extraido, dividido em chunks de 1000 tokens, embeddings gerados via OpenAI text-embedding-3-small e armazenados no pgvector para busca semantica coseno.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-23T19:24:38Z
- **Completed:** 2026-04-23T19:36:00Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments

- Migration 005 criada e aplicada com tabela dieta_chunks (FK dieta_id + paciente_id), index HNSW e funcao match_chunks_paciente
- Dependencias LangChain + pdf-parse instaladas; OPENAI_API_KEY adicionada ao schema de env
- ragService com processarDieta() (download -> parse -> split -> embed -> insert) e query() (embed -> RPC -> join)
- Rota POST /api/rag/processar com validacao, 202 imediato e processamento em background

## Task Commits

1. **Task 1: Migration dieta_chunks** - `5bdcf5f` (feat)
2. **Task 2: Instalar dependencias + env** - `089e746` (feat)
3. **Task 3: ragService** - `aac1c68` (feat)
4. **Task 4: rota /api/rag/processar** - `e3143f2` (feat)

## Deviations from Plan

Nenhuma — plano executado exatamente como especificado. TypeScript typecheck passou sem erros em todas as tasks.

## Known Stubs

Nenhum stub neste plano. O pipeline RAG esta completo end-to-end:
- processarDieta() — funcional (requer OPENAI_API_KEY e PDF valido no Storage)
- query() — funcional (requer chunks indexados via processarDieta)
- POST /api/rag/processar — funcional

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | backend/src/services/rag.ts | Chunks de texto da dieta (dados de saude) enviados para OpenAI API para gerar embeddings — risco aceito para v1 conforme T-02-02-01 |

Mitigacoes implementadas:
- T-02-02-02 (Tampering): /api/rag/processar sera protegido por auth na Fase 5; atualmente acessivel apenas via rede interna
- T-02-02-03 (DoS): processamento em background com resposta 202 imediata implementado

## Self-Check: PASSED

- [x] supabase/migrations/20260423000005_dieta_chunks.sql existe
- [x] backend/src/services/rag.ts existe com processarDieta e query
- [x] backend/src/routes/rag.ts existe com ragRouter
- [x] backend/src/routes/api.ts registra ragRouter
- [x] Commits 5bdcf5f, 089e746, aac1c68, e3143f2 existem
- [x] npm run typecheck sem erros

## Next Phase Readiness

- ragService.query(pacienteId, pergunta) pronto para ser chamado pelo agente Claude em 02-03
- POST /api/rag/processar disponivel para o nutricionista disparar indexacao apos upload de PDF
- Tabela dieta_chunks populada conforme PDFs sao processados

---
*Phase: 02-core-agente-onboarding-rag*
*Completed: 2026-04-23*
