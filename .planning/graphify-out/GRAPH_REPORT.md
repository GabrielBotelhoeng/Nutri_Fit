# Graph Report - .planning  (2026-07-08)

## Corpus Check
- 68 files · ~105,291 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 134 nodes · 154 edges · 18 communities (15 shown, 3 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.87)
- Token cost: 217,103 input · 0 output

## Community Hubs (Navigation)
- Fase 05 - Painel do Nutricionista
- Bugs P0/P1 do Backend
- RAG + Bug P0-1 (embeddings)
- Fase 04 - Alertas e Relatorio
- Stack e Servicos Externos
- Fase 06 - Landing Page
- Decisoes de Deploy e Backend
- GSD Framework e Fases
- Fase 03 - Registro Multimodal
- Calculos Nutricionais (Fase 02)
- Fase 04 - Plans/Summaries
- Fire-Forget Webhook + Bug P2-8
- Refatoracao Agente (funcoes puras)
- Fase 03 - Detalhes
- Dashboard UI
- Fase 02 - Review
- Fase 06 Plan 02
- Fase 06 Plan 03

## God Nodes (most connected - your core abstractions)
1. `Phase 5 Context: Painel do Nutricionista` - 8 edges
2. `Phase 6 Context: Landing Page` - 8 edges
3. `Calculos de TMB, hidratacao e creatina (02-04-PLAN)` - 5 edges
4. `Phase 4 Research` - 5 edges
5. `Plan 04-03 Summary: Relatorio Semanal + Registro de Agua` - 4 edges
6. `Fase 03-02 PLAN — registro por audio (Whisper)` - 3 edges
7. `Fase 03-03 PLAN — registro por imagem/Vision` - 3 edges
8. `Fase 04-02 PLAN — relatorio semanal` - 3 edges
9. `Summary 05-01: Scaffold nutrichat-painel + Auth Supabase` - 3 edges
10. `Plan 06-01: Landing Setup + Hero 3D` - 3 edges

## Surprising Connections (you probably didn't know these)
- `02-04 Summary — calculos nutricionais` --references--> `Calculos de TMB, hidratacao e creatina (02-04-PLAN)`  [INFERRED]
  phases/02-core-agente-onboarding-rag/02-04-SUMMARY.md → phases/02-core-agente-onboarding-rag/02-04-PLAN.md
- `Fase 02 Verification` --references--> `Calculos de TMB, hidratacao e creatina (02-04-PLAN)`  [INFERRED]
  phases/02-core-agente-onboarding-rag/02-VERIFICATION.md → phases/02-core-agente-onboarding-rag/02-04-PLAN.md
- `Fase 03-02 PLAN — registro por audio (Whisper)` --semantically_similar_to--> `Fase 03-03 PLAN — registro por imagem/Vision`  [INFERRED] [semantically similar]
  phases/03-registro-refeicoes-multimodal/03-02-PLAN.md → phases/03-registro-refeicoes-multimodal/03-03-PLAN.md
- `D-01 Next.js + Vercel Deploy` --semantically_similar_to--> `D-01 React Vite separado (Railway)`  [INFERRED] [semantically similar]
  phases/06-landing-page/06-CONTEXT.md → phases/05-painel-do-nutricionista/05-CONTEXT.md
- `Fase 02 Human UAT` --conceptually_related_to--> `Fase 02 Verification`  [INFERRED]
  phases/02-core-agente-onboarding-rag/02-HUMAN-UAT.md → phases/02-core-agente-onboarding-rag/02-VERIFICATION.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **** — phases_01_01_plan, phases_01_02_plan, phases_01_03_plan, phases_01_context, phases_01_discussion_log [INFERRED]
- **** — phases_02_02_plan, concept_rag_pipeline, concept_pgvector, concept_openai_embeddings [INFERRED]
- **** — bug_p0_1, bug_p2_7, bug_p2_8, concept_fire_forget_webhook [INFERRED]
- **Trio de calculos nutricionais pos-entrevista** — phases_02_core_agente_onboarding_rag_02_04_plan_mifflin_st_jeor, phases_02_core_agente_onboarding_rag_02_04_plan_calcular_hidratacao, phases_02_core_agente_onboarding_rag_02_04_plan_calcular_creatina [EXTRACTED 1.00]
- **Fase 03 multimodal: texto/audio/imagem/refinamentos** — phases_03_registro_refeicoes_multimodal_03_01_plan, phases_03_registro_refeicoes_multimodal_03_02_plan, phases_03_registro_refeicoes_multimodal_03_03_plan, phases_03_registro_refeicoes_multimodal_03_04_plan [INFERRED 0.85]
- **Fase 04 alertas e relatorio semanal** — phases_04_alertas_expiracao_relatorio_semanal_04_01_plan, phases_04_alertas_expiracao_relatorio_semanal_04_02_plan, phases_04_alertas_expiracao_relatorio_semanal_04_03_plan [INFERRED 0.85]
- **Wave 3 Relatorio Semanal flow (RPC + service + cron)** — phases_04_alertas_expiracao_relatorio_semanal_04_03_summary_rpc_registrar_agua_diaria, phases_04_alertas_expiracao_relatorio_semanal_04_03_summary_gerar_relatorio_semanal, phases_04_alertas_expiracao_relatorio_semanal_04_03_summary_cron_relatorio_semanal [EXTRACTED 1.00]
- **Painel Stack (React+Vite / Auth Supabase / PANEL_API_KEY)** — phases_05_painel_do_nutricionista_05_context_react_vite_separated, phases_05_painel_do_nutricionista_05_context_supabase_auth_client, phases_05_painel_do_nutricionista_05_context_panel_api_key [EXTRACTED 1.00]
- **Landing Hero 3D + Motion + Mobile Fallback** — phases_06_landing_page_06_context_react_three_fiber, phases_06_landing_page_06_context_framer_motion, phases_06_landing_page_06_context_mobile_fallback [EXTRACTED 1.00]

## Communities (18 total, 3 thin omitted)

### Community 0 - "Fase 05 - Painel do Nutricionista"
Cohesion: 0.11
Nodes (19): Plan 05-01: Scaffold Painel + Auth, Summary 05-01: Scaffold nutrichat-painel + Auth Supabase, Plan 05-02: Backend /api/pacientes, Summary 05-02: /api/pacientes + PANEL_API_KEY, Phase 5 Context: Painel do Nutricionista, D-07 D-08 Backend multipart + RAG fire-and-forget, backend/src/routes/pacientes.ts (Router), D-12 X-API-Key PANEL_API_KEY (+11 more)

### Community 1 - "Bugs P0/P1 do Backend"
Cohesion: 0.12
Nodes (17): P0-2 Silent Quantity, P0-2b Preparo, P1-3 Intent Regex, P1-4 Activity Factor, P1-5 MyFitnessPal, P1-6 Diet Times, P2-9 Memory, Row-Level Security (+9 more)

### Community 2 - "RAG + Bug P0-1 (embeddings)"
Cohesion: 0.23
Nodes (12): P0-1 Double Count, P2-7 Webhook Idempotency, OpenAI text-embedding-3-small, pgvector HNSW, RAG Pipeline, registros_diarios, Supabase Cloud, D-01 (+4 more)

### Community 3 - "Fase 04 - Alertas e Relatorio"
Cohesion: 0.18
Nodes (11): Plan 04-03 Summary: Relatorio Semanal + Registro de Agua, AGUA_RE regex detection, Cron N8N Domingo 08h Relatorio Semanal, gerarRelatorioSemanal service, RPC registrar_agua_diaria, Phase 4 Research, AGENT-17 Alertas agendados, AGENT-18 Aviso 3 dias antes expiracao (+3 more)

### Community 4 - "Stack e Servicos Externos"
Cohesion: 0.27
Nodes (10): Claude AI, Evolution API v2.3.7, Groq Whisper, N8N, NutriChat Project, 01-03-PLAN, 01-03-SUMMARY, 02-03-PLAN (+2 more)

### Community 5 - "Fase 06 - Landing Page"
Cohesion: 0.22
Nodes (10): Plan 06-01: Landing Setup + Hero 3D, Summary 06-01, Phase 6 Context: Landing Page, D-07 Framer Motion scroll-reveal, D-12/D-13 Mobile fallback imagem estatica, D-09/D-10/D-11 Planos + CTA WhatsApp, D-03 react-three-fiber Hero 3D, Phase 6 Discussion Log (+2 more)

### Community 6 - "Decisoes de Deploy e Backend"
Cohesion: 0.28
Nodes (9): Backend Express/TypeScript, Docker Compose Local, Railway, D-02, D-03, D-11, 01-02-PLAN, 01-02-SUMMARY (+1 more)

### Community 7 - "GSD Framework e Fases"
Cohesion: 0.36
Nodes (9): GSD Framework, v1.0 Milestone, Phase 01 Infrastructure, Phase 02 Core Agent, Phase 06 Landing Page, 01-DISCUSSION-LOG, REQUIREMENTS, ROADMAP (+1 more)

### Community 8 - "Fase 03 - Registro Multimodal"
Cohesion: 0.25
Nodes (8): Fase 03-01 PLAN — registro refeicoes texto, Fase 03-01 Summary, Fase 03-02 PLAN — registro por audio (Whisper), Fase 03-02 Summary, Fase 03-03 PLAN — registro por imagem/Vision, Fase 03-03 Summary, Fase 03 Context, Fase 03 Research

### Community 9 - "Calculos Nutricionais (Fase 02)"
Cohesion: 0.29
Nodes (7): calcularCreatina 0.03g por kg, calcularHidratacao 35ml por kg, Calculos de TMB, hidratacao e creatina (02-04-PLAN), Formula Mifflin-St Jeor, 02-04 Summary — calculos nutricionais, Fase 02 Human UAT, Fase 02 Verification

### Community 10 - "Fase 04 - Plans/Summaries"
Cohesion: 0.40
Nodes (5): Fase 04-01 PLAN — alertas de expiracao, Fase 04-01 Summary, Fase 04-02 PLAN — relatorio semanal, Fase 04-02 Summary, Fase 04-03 PLAN

### Community 11 - "Fire-Forget Webhook + Bug P2-8"
Cohesion: 0.50
Nodes (4): P2-8 Race Condition, Fire-and-Forget Webhook, 02-01-PLAN, 02-01-SUMMARY

### Community 12 - "Refatoracao Agente (funcoes puras)"
Cohesion: 0.67
Nodes (3): backend/src/services/agent.ts, backend/src/services/calculos.ts, Funcoes puras testaveis sem I/O

### Community 13 - "Fase 03 - Detalhes"
Cohesion: 0.67
Nodes (3): Fase 03-04 PLAN — refinamentos multimodal, Fase 03-04 Summary, Fase 03 Discussion Log

### Community 14 - "Dashboard UI"
Cohesion: 0.67
Nodes (3): Plan 05-03: Dashboard UI + Dockerfile, Summary 05-03: Dashboard UI + Caddy, Dashboard SPA UI (StatusBadge + PacienteModal)

## Knowledge Gaps
- **37 isolated node(s):** `Formula Mifflin-St Jeor`, `calcularHidratacao 35ml por kg`, `calcularCreatina 0.03g por kg`, `02-04 Summary — calculos nutricionais`, `Fase 02 Human UAT` (+32 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Phase 6 Context: Landing Page` connect `Fase 06 - Landing Page` to `Fase 05 - Painel do Nutricionista`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `Formula Mifflin-St Jeor`, `calcularHidratacao 35ml por kg`, `calcularCreatina 0.03g por kg` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Fase 05 - Painel do Nutricionista` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Bugs P0/P1 do Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._