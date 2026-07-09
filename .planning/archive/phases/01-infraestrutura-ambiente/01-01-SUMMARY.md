---
phase: 1
plan: "01-01"
title: "Supabase — tabelas, pgvector e Storage"
status: complete
completed_at: "2026-04-23T03:03:00Z"
duration: "3m"
tasks_completed: 2
tasks_total: 3
files_created: 5
files_modified: 0
requirements: [INFRA-01, INFRA-02, INFRA-03]
subsystem: database
tags: [supabase, sql, migrations, pgvector, rls, storage]
dependency_graph:
  requires: []
  provides:
    - supabase-schema-v1
    - pgvector-embeddings
    - rls-all-tables
    - storage-bucket-dietas
  affects:
    - 01-02 (backend conecta ao schema)
    - 01-03 (Docker Compose usa schema local)
    - Fase 2 (LangChain usa tabela dietas + embedding + match_dieta_chunks)
    - Fase 5 (painel web acessa tabelas via Supabase Auth + RLS)
tech_stack:
  added:
    - supabase migrations (SQL versionado)
    - pgvector extension
    - HNSW index
  patterns:
    - RLS com service_role bypass (backend sem policies, frontend autenticado)
    - Uma dieta ativa por paciente (status ativa/expirada)
    - Um registro acumulado por paciente/dia (UPSERT pattern)
key_files:
  created:
    - supabase/migrations/20260422000001_create_schema.sql
    - supabase/migrations/20260422000002_enable_pgvector.sql
    - supabase/migrations/20260422000003_rls_policies.sql
    - supabase/migrations/20260422000004_storage_bucket.sql
    - supabase/.gitignore
  modified: []
decisions:
  - "D-01 implementado: alertas_config com colunas separadas (horario_cafe, horario_almoco, horario_jantar, horarios_agua[], horario_suplementos[])"
  - "D-02 implementado: registros_diarios com UNIQUE(paciente_id, data) para acumulacao diaria"
  - "D-03 implementado: dietas com status CHECK('ativa','expirada') — historico preservado"
  - "D-04 implementado: 5 tabelas + pgvector com funcao match_dieta_chunks para RAG"
---

# Phase 1 Plan 01: Supabase — tabelas, pgvector e Storage — Summary

**One-liner:** Schema PostgreSQL completo (5 tabelas + pgvector HNSW + RLS + bucket privado) via 4 migrations SQL versionadas para o Supabase NutriChat.

---

## Objective

Estabelecer a fundacao de dados do NutriChat: 5 tabelas com constraints completas, pgvector habilitado para RAG das dietas em PDF, Row Level Security em todas as tabelas e bucket de Storage privado para PDFs.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema das 5 tabelas + pgvector | `029ba50` | 20260422000001_create_schema.sql, 20260422000002_enable_pgvector.sql |
| 2 | RLS policies + Storage bucket | `613b662` | 20260422000003_rls_policies.sql, 20260422000004_storage_bucket.sql, supabase/.gitignore |

---

## Schema Criado

### Tabelas e Colunas Principais

| Tabela | Colunas Principais | Constraints Notaveis |
|--------|-------------------|---------------------|
| `pacientes` | id, nome, whatsapp, plano, data_expiracao, ativo | UNIQUE(whatsapp), CHECK plano IN ('1mes','3meses','6meses','12meses') |
| `dietas` | id, paciente_id, pdf_url, status, embedding | CHECK status IN ('ativa','expirada'), index HNSW no embedding |
| `refeicoes` | id, paciente_id, descricao, kcal, proteina_g, carbo_g, gordura_g, tipo_registro | CHECK tipo_registro IN ('texto','audio','foto','codigo_barras','rotulo') |
| `registros_diarios` | id, paciente_id, data, kcal_consumido, proteina_g, carbo_g, gordura_g, agua_ml | UNIQUE(paciente_id, data) — acumulacao diaria |
| `alertas_config` | id, paciente_id, horario_cafe, horario_almoco, horario_jantar, horarios_agua[], horario_suplementos[] | UNIQUE(paciente_id) — uma config por paciente |

### Decisoes Implementadas (D-01 a D-04)

- **D-01** (`alertas_config`): Colunas separadas por tipo de alerta, arrays para agua e suplementos — evita JOINs nos cron jobs N8N
- **D-02** (`registros_diarios`): `UNIQUE(paciente_id, data)` garante exatamente uma linha por paciente por dia; UPDATE acumula macros
- **D-03** (`dietas`): `status CHECK('ativa','expirada')` — RAG sempre busca `status = 'ativa'`; historico preservado ao trocar dieta
- **D-04**: 5 tabelas completas + pgvector habilitado com `embedding vector(1536)` e index HNSW (m=16, ef_construction=64)

### pgvector

- Extensao `vector` habilitada
- Coluna `embedding vector(1536)` na tabela `dietas` (compativel com text-embedding-ada-002 / OpenAI)
- Index `HNSW` com `vector_cosine_ops` para busca por similaridade eficiente
- Funcao `match_dieta_chunks(query_embedding, paciente_id, threshold, count)` pronta para uso pelo LangChain na Fase 2

### Row Level Security

- RLS habilitado em todas as 5 tabelas
- `service_role` (backend Express com SUPABASE_SERVICE_KEY) bypassa RLS automaticamente — sem policies necessarias
- `authenticated` (nutricionista no painel) tem acesso total por enquanto — refinado na Fase 5 com auth real
- `anon` nao tem nenhuma policy — acesso negado por padrao

### Bucket Storage

- Bucket `dietas` criado com `public = false`
- Limite: 50 MB por arquivo
- MIME types permitidos: apenas `application/pdf`
- Policies: authenticated pode INSERT, SELECT e DELETE; anon nao tem acesso

---

## Deviations from Plan

### Authentication Gate — supabase db push (Task 3)

**Task 3 status:** Nao executada — gate de autenticacao.

**Motivo:** O Supabase CLI (disponivel via `npx supabase@2.93.1`) requer:
1. `supabase login` (autenticacao com a conta Supabase)
2. `supabase link --project-ref SEU_PROJECT_REF` (vincular ao projeto remoto)
3. `supabase db push` (aplicar as migrations)

**O que foi entregue:** Os 4 arquivos de migration SQL estao completos e prontos para aplicacao. Este e o artefato principal do plano.

**Passos para completar a Task 3 manualmente:**

```bash
# 1. Autenticar no Supabase CLI
npx supabase login

# 2. Navegar para o diretorio do projeto
cd "C:\Users\botel\OneDrive\Desktop\nutri_fit"

# 3. Inicializar o supabase no projeto (se nao feito)
npx supabase init

# 4. Vincular ao projeto remoto (pegar o project ref no Supabase Dashboard > Settings > General)
npx supabase link --project-ref SEU_PROJECT_REF

# 5. Aplicar as migrations
npx supabase db push
```

**Verificacao pos-push (Supabase Dashboard):**
1. Table Editor: confirmar 5 tabelas com colunas corretas
2. Authentication > Policies: confirmar RLS ativo em cada tabela
3. Storage: confirmar bucket 'dietas' como privado
4. SQL Editor: `SELECT extname FROM pg_extension WHERE extname = 'vector';` — deve retornar uma linha
5. Teste anon: `SELECT * FROM pacientes` com anon key — deve retornar vazio ou erro

---

## Verificacao Local dos Arquivos

```bash
# Confirmar 4 migrations existem
ls nutri_fit/supabase/migrations/

# Confirmar conteudo das migrations
grep "CREATE TABLE" nutri_fit/supabase/migrations/20260422000001_create_schema.sql
grep "CREATE EXTENSION" nutri_fit/supabase/migrations/20260422000002_enable_pgvector.sql
grep "ENABLE ROW LEVEL SECURITY" nutri_fit/supabase/migrations/20260422000003_rls_policies.sql
grep "INSERT INTO storage.buckets" nutri_fit/supabase/migrations/20260422000004_storage_bucket.sql
```

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| supabase/migrations/20260422000001_create_schema.sql | FOUND |
| supabase/migrations/20260422000002_enable_pgvector.sql | FOUND |
| supabase/migrations/20260422000003_rls_policies.sql | FOUND |
| supabase/migrations/20260422000004_storage_bucket.sql | FOUND |
| supabase/.gitignore | FOUND |
| Commit 029ba50 (Task 1) | FOUND |
| Commit 613b662 (Task 2) | FOUND |

---

## Known Stubs

Nenhum stub — migrations SQL sao DDL completo, nao codigo de aplicacao.

---

## Threat Flags

Nenhuma superficie nova alem do que esta no threat model do plano.

| Mitigacao | Status |
|-----------|--------|
| T-01-01: RLS em todas as tabelas | Implementado em 20260422000003_rls_policies.sql |
| T-01-02: Bucket 'dietas' privado | Implementado em 20260422000004_storage_bucket.sql (public=false) |
| T-01-03: SERVICE_KEY nunca commitada | Confirmado — nenhuma credencial nos arquivos SQL |
| T-01-04: Tampering no embedding | Aceito para v1 |
