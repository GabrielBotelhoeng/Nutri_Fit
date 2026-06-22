# Roadmap: NutriChat

## Overview

NutriChat é construído em sete fases que partem da infraestrutura base até o deploy final como portfólio. Cada fase entrega uma capacidade coerente e verificável: primeiro o ambiente funciona, depois o agente inteligente opera no WhatsApp, depois refeições são registradas por qualquer mídia, depois alertas e relatórios são enviados, depois o nutricionista gerencia tudo via painel web, depois a landing page apresenta o produto, e por fim o projeto é polido e publicado como portfólio.

## Phases

- [ ] **Phase 1: Infraestrutura & Ambiente** - Ambiente completo provisionado e serviços conectados
- [ ] **Phase 2: Core do Agente — Onboarding & RAG** - Agente recebe mensagens, lê a dieta e entrevista o paciente
- [ ] **Phase 3: Registro de Refeições Multimodal** - Paciente registra refeições por texto, áudio, foto e código de barras
- [ ] **Phase 4: Alertas, Expiração & Relatório Semanal** - Agente avisa, bloqueia e reporta automaticamente
- [ ] **Phase 5: Painel do Nutricionista** - Nutricionista gerencia pacientes via interface web segura
- [ ] **Phase 6: Landing Page** - Apresentação do produto com hero 3D e seção de planos
- [ ] **Phase 7: Portfólio & Deploy Final** - Projeto publicado e apresentável no LinkedIn/GitHub

## Phase Details

### Phase 1: Infraestrutura & Ambiente
**Goal**: Ambiente completo provisionado, todos os serviços conectados e comunicando entre si
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. Supabase tem tabelas criadas (pacientes, dietas, refeições, registros_diarios, alertas_config) e pgvector habilitado
  2. Evolution API está conectada ao WhatsApp e envia/recebe mensagens de teste
  3. N8N rodando no Railway processa um webhook de entrada vindo da Evolution API
  4. Backend Node.js/Express deployado no Railway responde a um GET /health com status 200
  5. Supabase Storage aceita upload de PDF e o arquivo fica acessível com acesso restrito
**Plans**: TBD

Plans:
- [x] 01-01: Supabase — tabelas, pgvector e Storage
- [x] 01-02: Railway — backend Node.js/Express + variáveis de ambiente
- [ ] 01-03: Evolution API + N8N — conexão WhatsApp e webhook

### Phase 2: Core do Agente — Onboarding & RAG
**Goal**: Agente recebe mensagens do WhatsApp, lê a dieta do paciente via RAG e conduz a entrevista inicial
**Depends on**: Phase 1
**Requirements**: AGENT-01, AGENT-07, AGENT-08, AGENT-09, AGENT-10, AGENT-11, AGENT-12
**Success Criteria** (what must be TRUE):
  1. Webhook recebe mensagem de texto, áudio e imagem e roteia cada uma para o fluxo correto
  2. Ao cadastrar paciente no painel, agente envia boas-vindas no WhatsApp usando o nome do cadastro
  3. Agente conduz entrevista inicial e coleta idade, sexo, peso, altura, atividade física e suplementos
  4. Agente calcula e responde TMB, hidratação diária (35ml/kg) e dose de creatina com base nos dados coletados
  5. Pergunta sobre a dieta do paciente retorna resposta baseada no PDF processado via RAG
**Plans**: Created

Plans:
- [x] 02-01: Webhook routing por tipo de mídia (AGENT-01)
- [ ] 02-02: Pipeline RAG — PDF para pgvector (AGENT-07)
- [ ] 02-03: Boas-vindas automática + entrevista inicial (AGENT-08, AGENT-09)
- [ ] 02-04: Cálculos de TMB, hidratação e creatina (AGENT-10, AGENT-11, AGENT-12)

### Phase 3: Registro de Refeições Multimodal
**Goal**: Paciente consegue registrar qualquer refeição por qualquer mídia e receber saldo nutricional do dia
**Depends on**: Phase 2
**Requirements**: AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-13, AGENT-14, AGENT-15, AGENT-16
**Success Criteria** (what must be TRUE):
  1. Paciente envia áudio descrevendo refeição e agente transcreve, calcula macros e registra
  2. Paciente envia foto do prato e agente confirma os alimentos antes de registrar (nunca afirma sem certeza)
  3. Paciente envia foto com 2 ângulos e agente estima porção com aviso explícito de limitação
  4. Paciente envia foto de código de barras e agente busca nutrientes via Open Food Facts e registra
  5. Paciente envia foto de rótulo nutricional e agente lê os valores e registra
  6. Após cada registro, agente exibe kcal consumido vs meta e macros parciais do dia
  7. Agente sugere substituição de alimento ausente usando apenas itens da dieta prescrita
**Plans**: 4 plans

Plans:
- [ ] 03-04-PLAN.md — RPC Supabase acumular_registro_diario (schema — Wave 1)
- [ ] 03-01-PLAN.md — Transcrição de áudio via Groq Whisper (Wave 2)
- [ ] 03-03-PLAN.md — Registro por texto + saldo do dia + substituições (Wave 2)
- [ ] 03-02-PLAN.md — Análise de imagem Claude Vision + código de barras + rótulo (Wave 3)
**UI hint**: yes

### Phase 4: Alertas, Expiração & Relatório Semanal
**Goal**: Agente avisa o paciente nos horários certos, bloqueia no vencimento e envia relatório todo domingo
**Depends on**: Phase 3
**Requirements**: AGENT-17, AGENT-18, AGENT-19, AGENT-20
**Success Criteria** (what must be TRUE):
  1. Paciente recebe alertas de refeição, água e suplementos nos horários configurados via cron N8N
  2. 3 dias antes do vencimento, paciente recebe aviso automático sobre expiração do plano
  3. No dia do vencimento, agente para de responder normalmente e envia apenas instruções de renovação
  4. Todo domingo, paciente recebe relatório com total kcal, média de macros, hidratação média, dias que bateram meta e mensagem de incentivo
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Expiração: endpoint /api/expiracao/verificar + aviso inline em agent.ts (AGENT-18, AGENT-19)
- [x] 04-02-PLAN.md — Alertas de refeição/água/suplementos + seed alertas_config (AGENT-17)
- [ ] 04-03-PLAN.md — Relatório semanal + registro de água via texto (AGENT-20)

### Phase 5: Painel do Nutricionista
**Goal**: Nutricionista acessa painel seguro, cadastra pacientes com upload de dieta e gerencia planos
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06
**Success Criteria** (what must be TRUE):
  1. Nutricionista faz login com email/senha e sessão persiste entre visitas sem precisar logar novamente
  2. Painel não tem cadastro público — somente usuários criados manualmente no Supabase Auth conseguem entrar
  3. Nutricionista cadastra paciente com nome, WhatsApp, plano e data de expiração, faz upload do PDF e o sistema dispara boas-vindas automaticamente
  4. Lista de pacientes mostra status visual de cada plano: ativo, expirando em breve, expirado
  5. Nutricionista pode ativar/desativar acesso e atualizar data de expiração de qualquer paciente
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — Scaffold nutrichat-painel + Supabase Auth (Wave 1)
- [ ] 05-02-PLAN.md — Backend routes /api/pacientes + multer + Storage + bug fix rag.ts (Wave 1)
- [ ] 05-03-PLAN.md — Dashboard UI + StatusBadge + PacienteModal + Dockerfile + Caddy (Wave 2)
**UI hint**: yes

### Phase 6: Landing Page
**Goal**: Landing page apresenta o NutriChat com hero 3D, funcionalidades e planos, pronta para Vercel
**Depends on**: Phase 1
**Requirements**: LANDING-01, LANDING-02, LANDING-03, LANDING-04, LANDING-05, LANDING-06, LANDING-07, LANDING-08
**Success Criteria** (what must be TRUE):
  1. Hero exibe celular 3D animado (Three.js) simulando conversa no Nutri Chat sobre fundo verde off-white
  2. Seções "Como funciona", funcionalidades e depoimentos estão presentes e visualmente coerentes com a paleta do projeto
  3. Seção de planos exibe preços e ao clicar no CTA abre WhatsApp do nutricionista com mensagem pré-preenchida
  4. Site é responsivo em mobile, tablet e desktop (mobile-first)
  5. Deploy automático na Vercel a partir do repositório GitHub funciona após cada push na branch principal
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md — Setup Next.js + react-three-fiber + hero 3D animado (LANDING-01, LANDING-07)
- [ ] 06-02-PLAN.md — Seções de conteúdo — Como funciona, funcionalidades, depoimentos (LANDING-02, LANDING-03, LANDING-04)
- [ ] 06-03-PLAN.md — Planos + CTA + rodapé + deploy Vercel (LANDING-05, LANDING-06, LANDING-08)
**UI hint**: yes

### Phase 7: Portfólio & Deploy Final
**Goal**: Projeto completamente publicado, documentado e apresentável como portfólio no LinkedIn e GitHub
**Depends on**: Phase 5, Phase 6
**Requirements**: (portfolio polish — sem REQ-IDs adicionais; todos já cobertos nas fases anteriores)
**Success Criteria** (what must be TRUE):
  1. README de cada repositório descreve o projeto, stack, como rodar localmente e como usar
  2. Demo funcional acessível publicamente (landing page na Vercel + painel no Railway)
  3. Post ou atualização no LinkedIn referencia o projeto com link para repositório e demo
**Plans**: TBD

Plans:
- [ ] 07-01: READMEs dos três repositórios
- [ ] 07-02: Checklist de deploy final + smoke test de ponta a ponta
- [ ] 07-03: Publicação no LinkedIn

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7
(Phase 5 pode ser executada em paralelo com Phase 3/4 pois depende apenas de Phase 2)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infraestrutura & Ambiente | 2/3 | In Progress | - |
| 2. Core do Agente — Onboarding & RAG | 1/4 | In Progress | - |
| 3. Registro de Refeições Multimodal | 0/4 | Planned | - |
| 4. Alertas, Expiração & Relatório Semanal | 1/3 | In Progress | - |
| 5. Painel do Nutricionista | 0/3 | Not started | - |
| 6. Landing Page | 1/3 | In Progress | - |
| 7. Portfólio & Deploy Final | 0/3 | Not started | - |

## Traceability Matrix

| REQ-ID | Fase | Categoria |
|--------|------|-----------|
| INFRA-01 | Phase 1 | Infraestrutura |
| INFRA-02 | Phase 1 | Infraestrutura |
| INFRA-03 | Phase 1 | Infraestrutura |
| INFRA-04 | Phase 1 | Infraestrutura |
| INFRA-05 | Phase 1 | Infraestrutura |
| INFRA-06 | Phase 1 | Infraestrutura |
| INFRA-07 | Phase 1 | Infraestrutura |
| AGENT-01 | Phase 2 | Agente WhatsApp |
| AGENT-07 | Phase 2 | Agente WhatsApp |
| AGENT-08 | Phase 2 | Agente WhatsApp |
| AGENT-09 | Phase 2 | Agente WhatsApp |
| AGENT-10 | Phase 2 | Agente WhatsApp |
| AGENT-11 | Phase 2 | Agente WhatsApp |
| AGENT-12 | Phase 2 | Agente WhatsApp |
| AGENT-02 | Phase 3 | Agente WhatsApp |
| AGENT-03 | Phase 3 | Agente WhatsApp |
| AGENT-04 | Phase 3 | Agente WhatsApp |
| AGENT-05 | Phase 3 | Agente WhatsApp |
| AGENT-06 | Phase 3 | Agente WhatsApp |
| AGENT-13 | Phase 3 | Agente WhatsApp |
| AGENT-14 | Phase 3 | Agente WhatsApp |
| AGENT-15 | Phase 3 | Agente WhatsApp |
| AGENT-16 | Phase 3 | Agente WhatsApp |
| AGENT-17 | Phase 4 | Agente WhatsApp |
| AGENT-18 | Phase 4 | Agente WhatsApp |
| AGENT-19 | Phase 4 | Agente WhatsApp |
| AGENT-20 | Phase 4 | Agente WhatsApp |
| AUTH-01 | Phase 5 | Autenticacao |
| AUTH-02 | Phase 5 | Autenticacao |
| AUTH-03 | Phase 5 | Autenticacao |
| PANEL-01 | Phase 5 | Painel |
| PANEL-02 | Phase 5 | Painel |
| PANEL-03 | Phase 5 | Painel |
| PANEL-04 | Phase 5 | Painel |
| PANEL-05 | Phase 5 | Painel |
| PANEL-06 | Phase 5 | Painel |
| LANDING-01 | Phase 6 | Landing Page |
| LANDING-02 | Phase 6 | Landing Page |
| LANDING-03 | Phase 6 | Landing Page |
| LANDING-04 | Phase 6 | Landing Page |
| LANDING-05 | Phase 6 | Landing Page |
| LANDING-06 | Phase 6 | Landing Page |
| LANDING-07 | Phase 6 | Landing Page |
| LANDING-08 | Phase 6 | Landing Page |

**Coverage:** 44/44 requisitos v1 mapeados (100%)

---

*NutriChat ROADMAP.md — Gerado em 2026-04-22 | Fase 3 planejada em 2026-04-24 | Fase 4 planejada em 2026-04-25 | Fase 6 planejada em 2026-04-29*
