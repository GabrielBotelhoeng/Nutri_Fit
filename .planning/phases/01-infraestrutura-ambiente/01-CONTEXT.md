# Phase 1: Infraestrutura & Ambiente - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Provisionar o ambiente completo do NutriChat: banco de dados Supabase com schema definitivo, pgvector e Storage configurados; backend Node.js/Express deployado no Railway; Evolution API conectada ao WhatsApp via número dedicado; N8N no Railway processando webhooks de entrada; Docker Compose local para desenvolvimento offline.

Esta fase **não** inclui lógica de agente, RAG, transcrição de áudio ou análise de imagem — apenas a infraestrutura que suporta tudo isso nas fases seguintes.

</domain>

<decisions>
## Implementation Decisions

### Schema do Supabase

- **D-01:** `alertas_config` — uma linha por paciente. Colunas separadas (ou JSONB) por tipo de alerta: `horario_cafe`, `horario_almoco`, `horario_jantar`, `horarios_agua` (array), `horario_suplementos` (array), `ativo`. Fácil de consultar nos cron jobs do N8N sem JOINs complexos.

- **D-02:** `registros_diarios` — acumulação por dia. Uma linha por `(paciente_id, data)` com campos: `kcal_consumido`, `proteina_g`, `carbo_g`, `gordura_g`, `agua_ml`, `updated_at`. Cada refeição registrada faz UPDATE nessa linha. Simplifica relatório semanal (SUM de 7 linhas por paciente).

- **D-03:** `dietas` — uma dieta ativa por paciente. Colunas: `paciente_id`, `pdf_url` (Supabase Storage), `status` (`ativa` | `expirada`), `created_at`. Ao enviar nova dieta, a anterior é marcada como `expirada`. RAG sempre busca a dieta com `status = 'ativa'`. Histórico de trocas preservado.

- **D-04:** Tabelas a criar no Supabase: `pacientes`, `dietas`, `refeicoes`, `registros_diarios`, `alertas_config`. pgvector habilitado para embeddings das dietas.

### TypeScript & Runtime

- **D-05:** Backend Node.js/Express em **TypeScript**. Melhor para portfólio público (tipagem, autocomplete, profissionalismo).

- **D-06:** Runtime: **Node.js 20 LTS**. Dev: `tsx` para executar TS diretamente sem compilação. Produção: `tsc` gera build em `/dist`. Sem ts-node (tsx é mais rápido).

### Evolution API

- **D-07:** Evolution API rodando como **serviço Docker separado no Railway** — não junto com o backend Express. Railway gera URL pública fixada que o N8N usa como destino de webhook.

- **D-08:** Número de WhatsApp dedicado já disponível — não usar número pessoal.

- **D-09:** Método de conexão WhatsApp: **Pairing Code (Link Code)**. Sem necessidade de escanear QR code.

### Ambiente de Desenvolvimento

- **D-10:** **Docker Compose local** para desenvolvimento offline — Evolution API, N8N, Postgres com pgvector e backend Express todos orquestrados localmente. Sem dependência de Railway para escrever código.

- **D-11:** Gerenciamento de segredos: **`.env` local** para desenvolvimento (adicionado ao `.gitignore`) + **Railway Variables** para produção. Repositório inclui `.env.example` commitado com todas as chaves sem valores — facilita onboarding e documenta a configuração necessária.

### Claude's Discretion

- Estrutura de pastas do backend (ex: `src/routes/`, `src/services/`, `src/controllers/`) — Claude decide seguindo convenções Express/TS.
- Versões exatas de dependências (express, @supabase/supabase-js, etc.) — Claude usa LTS estáveis.
- Configuração de RLS no Supabase — Claude aplica políticas adequadas para acesso restrito.
- Nome das instâncias e serviços no Railway — Claude decide seguindo convenção do projeto.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da Fase 1
- `.planning/REQUIREMENTS.md` §INFRA — Requisitos INFRA-01 a INFRA-07 (7 requisitos desta fase)
- `.planning/ROADMAP.md` §Phase 1 — Goal, Success Criteria e Plans desta fase

### Projeto
- `.planning/PROJECT.md` — Stack completa, decisões de arquitetura e identidade visual

### Stack externo
- Evolution API: https://doc.evolution-api.com — Docs oficiais (webhook, instâncias, Pairing Code)
- Supabase pgvector: https://supabase.com/docs/guides/ai/vector-columns — Habilitar pgvector e criar colunas de embedding

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Pasta `evolution-api/` no diretório raiz — verificar se contém configuração ou docker-compose existente antes de criar do zero.

### Established Patterns
- Projeto greenfield — sem padrões de código existentes. Esta fase estabelece as convenções para todas as fases seguintes.

### Integration Points
- Supabase Storage → tabela `dietas` (pdf_url aponta para arquivo no bucket)
- Evolution API webhook → N8N → Backend Express
- N8N cron jobs → consulta `alertas_config` → Evolution API (envio de mensagens)
- pgvector embeddings → tabela `dietas` (via LangChain na Fase 2)

</code_context>

<specifics>
## Specific Ideas

- Docker Compose local deve incluir Postgres com a extensão pgvector para paridade com o Supabase Cloud em desenvolvimento.
- `.env.example` deve listar explicitamente: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `N8N_WEBHOOK_URL`, `CLAUDE_API_KEY`, `GROQ_API_KEY`.

</specifics>

<deferred>
## Deferred Ideas

None — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 01-infraestrutura-ambiente*
*Context gathered: 2026-04-22*
