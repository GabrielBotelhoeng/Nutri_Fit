# NutriChat — Requisitos v1

**Gerado:** 2026-04-22
**Fonte:** PROJETO.md (documento completo do produto)
**Granularidade:** Standard

---

## v1 Requirements

### AGENT — Agente WhatsApp (Nutri Chat)

- [ ] **AGENT-01**: Sistema recebe webhook do Evolution API e roteia por tipo de mídia (texto, áudio, imagem, código de barras)
- [ ] **AGENT-02**: Áudio do paciente é transcrito automaticamente via Groq Whisper e tratado como texto
- [ ] **AGENT-03**: Imagem de prato é analisada pelo Claude Vision; agente confirma alimentos antes de registrar (nunca afirma sem 100% de certeza)
- [ ] **AGENT-04**: Foto do prato com 2 ângulos (cima + lateral) gera estimativa de porção com aviso explícito de limitação
- [ ] **AGENT-05**: Código de barras na foto é identificado e nutrientes buscados via Open Food Facts API
- [ ] **AGENT-06**: Foto de rótulo nutricional inteiro é lida pelo Claude Vision e valores registrados
- [ ] **AGENT-07**: PDF da dieta é processado via LangChain + pgvector e disponibilizado como contexto RAG para o agente
- [ ] **AGENT-08**: Agente envia mensagem de boas-vindas automática ao cadastro do paciente (nome vem do cadastro, não pergunta)
- [ ] **AGENT-09**: Entrevista inicial coleta: idade, sexo, peso, altura, atividade física (tipo, frequência, horário), suplementos
- [ ] **AGENT-10**: Agente calcula TMB com base em peso, altura, idade, sexo e nível de atividade (fórmula Mifflin-St Jeor)
- [ ] **AGENT-11**: Agente calcula meta de hidratação diária (35ml/kg) e sugere distribuição ao longo do dia
- [ ] **AGENT-12**: Agente calcula dose de creatina quando não definida na dieta (0,03g/kg); respeita doses do nutricionista se definidas
- [ ] **AGENT-13**: Paciente registra refeição por texto (ex: "comi 400g de arroz com frango"); agente calcula macros e registra
- [ ] **AGENT-14**: Paciente registra refeição por áudio; após transcrição, mesmo fluxo do texto
- [ ] **AGENT-15**: Agente exibe saldo do dia após cada refeição (kcal consumido vs meta, macros parciais)
- [ ] **AGENT-16**: Agente sugere substituições de alimentos ausentes usando apenas itens da dieta prescrita pelo nutricionista
- [ ] **AGENT-17**: Alertas agendados enviados nos horários configurados: refeições, água, suplementos (cron jobs N8N)
- [ ] **AGENT-18**: Agente avisa paciente 3 dias antes da expiração do plano
- [ ] **AGENT-19**: No vencimento do plano, agente bloqueia e responde apenas informando como renovar
- [ ] **AGENT-20**: Relatório semanal enviado todo domingo com: total kcal, média de macros, hidratação média, dias que bateram meta, mensagem de incentivo

### AUTH — Autenticação

- [ ] **AUTH-01**: Nutricionista faz login no painel com email/senha via Supabase Auth
- [ ] **AUTH-02**: Sessão do nutricionista persiste entre visitas (token renovado automaticamente)
- [ ] **AUTH-03**: Painel sem cadastro público — acesso restrito a usuários criados manualmente no Supabase Auth

### PANEL — Painel do Nutricionista

- [ ] **PANEL-01**: Nutricionista cadastra paciente com: nome completo, número WhatsApp, plano (1/3/6/12 meses), data de expiração
- [ ] **PANEL-02**: Ao salvar paciente, sistema faz upload do PDF da dieta no Supabase Storage e inicia processamento RAG
- [ ] **PANEL-03**: Ao salvar paciente com upload, sistema dispara automaticamente mensagem de boas-vindas no WhatsApp do paciente via Evolution API
- [ ] **PANEL-04**: Nutricionista visualiza lista de pacientes com status: ativo, expirando em breve, expirado
- [ ] **PANEL-05**: Nutricionista pode ativar/desativar acesso do paciente manualmente
- [ ] **PANEL-06**: Nutricionista pode atualizar data de expiração de um plano (renovação manual)

### LANDING — Landing Page

- [ ] **LANDING-01**: Hero com celular 3D animado (Three.js) simulando conversa no Nutri Chat, fundo verde off-white
- [ ] **LANDING-02**: Seção "Como funciona" com 3-4 passos ilustrados (nutricionista cadastra → agente contata → paciente registra → relatório)
- [ ] **LANDING-03**: Seção de funcionalidades principais: registro por foto/áudio, alertas, relatório semanal
- [ ] **LANDING-04**: Seção de depoimentos (placeholders para portfólio)
- [ ] **LANDING-05**: Seção de planos com preços e CTA que abre WhatsApp do nutricionista com mensagem pré-preenchida
- [ ] **LANDING-06**: Rodapé com contato e redes sociais
- [ ] **LANDING-07**: Site responsivo (mobile-first) com paleta de cores definida no PROJETO.md
- [ ] **LANDING-08**: Deploy automático na Vercel a partir do repositório GitHub

### INFRA — Infraestrutura

- [ ] **INFRA-01**: Supabase configurado com tabelas: pacientes, dietas, refeições, registros_diarios, alertas_config
- [ ] **INFRA-02**: Supabase Storage configurado para PDFs das dietas com acesso restrito
- [ ] **INFRA-03**: pgvector habilitado no Supabase para embeddings RAG da dieta
- [ ] **INFRA-04**: Evolution API conectada ao WhatsApp e configurada com webhook para o N8N
- [ ] **INFRA-05**: N8N configurado no Railway com workflows: agente principal, alertas cron, relatório semanal, verificação de expiração
- [ ] **INFRA-06**: Backend Node.js/Express deployado no Railway com variáveis de ambiente configuradas
- [ ] **INFRA-07**: Cron job diário no N8N verifica expiração de planos e dispara avisos/bloqueios

---

## v2 Requirements (Deferred)

- Pagamento online automático (Stripe/PagSeguro) — contratação manual é suficiente para v1
- Dashboard com métricas e gráficos de evolução do paciente — painel simples primeiro
- Multi-idioma — PT-BR apenas para v1
- Múltiplos nutricionistas (SaaS) — single-tenant por design
- App mobile — WhatsApp é o canal
- Integração com balanças inteligentes — fora do escopo de portfólio
- Evolução automática de plano pelo agente — nutricionista decide

---

## Out of Scope

- **SaaS multi-tenant** — produto para nutricionista individual, não plataforma
- **Pagamento automático** — processo manual via WhatsApp é intencional para v1
- **App móvel** — WhatsApp nativo é o canal de comunicação com o paciente
- **Geração de dietas pelo agente** — agente executa a dieta, não a cria
- **Integração com planos de saúde** — fora do escopo
- **Relatórios médicos formais** — produto de suporte, não substituição nutricional

---

## Traceability

| REQ-ID | Fase | Status |
|--------|------|--------|
| INFRA-01 | Phase 1 — Infraestrutura & Ambiente | Pending |
| INFRA-02 | Phase 1 — Infraestrutura & Ambiente | Pending |
| INFRA-03 | Phase 1 — Infraestrutura & Ambiente | Pending |
| INFRA-04 | Phase 1 — Infraestrutura & Ambiente | Pending |
| INFRA-05 | Phase 1 — Infraestrutura & Ambiente | Pending |
| INFRA-06 | Phase 1 — Infraestrutura & Ambiente | Pending |
| INFRA-07 | Phase 1 — Infraestrutura & Ambiente | Pending |
| AGENT-01 | Phase 2 — Core do Agente — Onboarding & RAG | Pending |
| AGENT-07 | Phase 2 — Core do Agente — Onboarding & RAG | Pending |
| AGENT-08 | Phase 2 — Core do Agente — Onboarding & RAG | Pending |
| AGENT-09 | Phase 2 — Core do Agente — Onboarding & RAG | Pending |
| AGENT-10 | Phase 2 — Core do Agente — Onboarding & RAG | Pending |
| AGENT-11 | Phase 2 — Core do Agente — Onboarding & RAG | Pending |
| AGENT-12 | Phase 2 — Core do Agente — Onboarding & RAG | Pending |
| AGENT-02 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-03 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-04 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-05 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-06 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-13 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-14 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-15 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-16 | Phase 3 — Registro de Refeicoes Multimodal | Pending |
| AGENT-17 | Phase 4 — Alertas, Expiracao & Relatorio Semanal | Pending |
| AGENT-18 | Phase 4 — Alertas, Expiracao & Relatorio Semanal | Pending |
| AGENT-19 | Phase 4 — Alertas, Expiracao & Relatorio Semanal | Pending |
| AGENT-20 | Phase 4 — Alertas, Expiracao & Relatorio Semanal | Pending |
| AUTH-01 | Phase 5 — Painel do Nutricionista | Pending |
| AUTH-02 | Phase 5 — Painel do Nutricionista | Pending |
| AUTH-03 | Phase 5 — Painel do Nutricionista | Pending |
| PANEL-01 | Phase 5 — Painel do Nutricionista | Pending |
| PANEL-02 | Phase 5 — Painel do Nutricionista | Pending |
| PANEL-03 | Phase 5 — Painel do Nutricionista | Pending |
| PANEL-04 | Phase 5 — Painel do Nutricionista | Pending |
| PANEL-05 | Phase 5 — Painel do Nutricionista | Pending |
| PANEL-06 | Phase 5 — Painel do Nutricionista | Pending |
| LANDING-01 | Phase 6 — Landing Page | Pending |
| LANDING-02 | Phase 6 — Landing Page | Pending |
| LANDING-03 | Phase 6 — Landing Page | Pending |
| LANDING-04 | Phase 6 — Landing Page | Pending |
| LANDING-05 | Phase 6 — Landing Page | Pending |
| LANDING-06 | Phase 6 — Landing Page | Pending |
| LANDING-07 | Phase 6 — Landing Page | Pending |
| LANDING-08 | Phase 6 — Landing Page | Pending |

**Cobertura:** 44/44 requisitos v1 mapeados (100%)

---

*NutriChat v1 Requirements — 2026-04-22*
