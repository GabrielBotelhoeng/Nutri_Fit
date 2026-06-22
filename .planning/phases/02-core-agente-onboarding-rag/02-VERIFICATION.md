---
phase: 02-core-agente-onboarding-rag
verified: 2026-04-23T23:59:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Enviar mensagem de texto via WhatsApp para o numero conectado na instancia nutrichat"
    expected: "Bot responde com mensagem de boas-vindas personalizada (nome do paciente) + primeira pergunta da entrevista"
    why_human: "Requer WhatsApp real conectado, Evolution API ativa e paciente cadastrado no Supabase"
  - test: "Completar as 7 etapas da entrevista respondendo perguntas sequencialmente"
    expected: "Agente avanca etapa a etapa; resposta invalida repete a pergunta; apos etapa 7 envia TMB, hidratacao e creatina formatados"
    why_human: "Comportamento conversacional end-to-end requer sessao WhatsApp real com estados persistidos"
  - test: "Chamar POST /api/boas-vindas/:pacienteId com um pacienteId valido"
    expected: "Retorna 202 imediatamente; paciente recebe mensagem de boas-vindas no WhatsApp; entrevista_status muda para em_andamento"
    why_human: "Requer WhatsApp ativo e paciente no banco — verificavel em ambiente Docker apenas"
  - test: "Enviar PDF de dieta via POST /api/rag/processar e depois perguntar algo sobre a dieta"
    expected: "Retorna 202; chunks sao indexados no pgvector; ao perguntar 'qual e minha proteina diaria?', agente responde com base no PDF"
    why_human: "Requer OPENAI_API_KEY ativa com credito, PDF valido no Supabase Storage e ambiente Docker completo"
---

# Phase 2: Core do Agente — Onboarding & RAG — Verification Report

**Phase Goal:** Implementar o nucleo conversacional do agente NutriChat — webhook funcional conectado ao Claude, onboarding automatico com entrevista inicial de coleta de dados do paciente, pipeline RAG para consulta da dieta prescrita, e calculos nutricionais personalizados (TMB, hidratacao, creatina).
**Verified:** 2026-04-23T23:59:00Z
**Status:** human_needed
**Re-verification:** No — verificacao inicial

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/webhook aceita payload do Evolution API e retorna 200 imediatamente | VERIFIED | `webhookRouter.post('/')` responde `res.status(200)` antes do switch — `backend/src/routes/webhook.ts:25` |
| 2 | Rota identifica tipo de midia a partir de messageType (texto, audio, imagem) | VERIFIED | Switch por `messageType` cobre `conversation`, `extendedTextMessage`, `audioMessage`, `imageMessage` — `webhook.ts:41-64` |
| 3 | EvolutionService.sendText() envia mensagem via Evolution API REST | VERIFIED | `evolution.ts` exporta `sendText` com fetch para `/message/sendText/${INSTANCE}` com header `apikey` — sem dependencias extras |
| 4 | POST /api/rag/processar recebe paciente_id, dieta_id e pdf_url e processa em background | VERIFIED | `rag.ts` (routes) retorna 202 imediatamente e chama `processarDieta` com `.catch` — `routes/rag.ts:21-26` |
| 5 | PDF e dividido em chunks, embeddings gerados via OpenAI text-embedding-3-small, armazenados em dieta_chunks | VERIFIED | `rag.ts` (services): RecursiveCharacterTextSplitter (1000/200), OpenAIEmbeddings (`text-embedding-3-small`), insere em `dieta_chunks` — linhas 14-75 |
| 6 | ragService.query() busca chunks por similaridade coseno e retorna contexto para o Claude | VERIFIED | `query()` gera embedding, chama `match_chunks_paciente` via RPC Supabase, retorna chunks concatenados — `rag.ts:78-98` |
| 7 | agentService.processarMensagem() gerencia estado e processa mensagem com Claude | VERIFIED | `agent.ts` exporta `processarMensagem`: roteia por `pendente` -> boas-vindas, `em_andamento` -> entrevista, `completa` -> RAG+Claude |
| 8 | Primeiro contato dispara boas-vindas com nome do paciente e inicia entrevista | VERIFIED | Bloco `status === 'pendente'` envia `Ola, ${paciente.nome}!` + PERGUNTAS_ENTREVISTA[1] — `agent.ts:132-141` |
| 9 | Entrevista coleta sequencialmente: idade, sexo, peso, altura, atividade_fisica, suplementos | VERIFIED | 7 etapas com parsing deterministico; `PERGUNTAS_ENTREVISTA` 1-7; `processarRespostaEntrevista` trata cada etapa — `agent.ts:22-85` |
| 10 | Estado da entrevista e persistido em entrevista_dados e entrevista_status (Supabase) | VERIFIED | Migration 006 adiciona colunas; `getEstado`/`atualizarEstado` em `conversation.ts` fazem leitura/merge JSONB |
| 11 | calcularTMB() implementa formula Mifflin-St Jeor com fator de atividade | VERIFIED | Formula verificada: `10*peso + 6.25*altura - 5*idade +/-5/161` com 5 fatores (1.2 a 1.9) — `calculos.ts:50-68` |
| 12 | calcularHidratacao() retorna meta diaria em ml (35ml/kg) com distribuicao em 8 porcoes | VERIFIED | `meta_ml = Math.round(peso_kg * 35)`, `distribuicao` com 8 entradas — `calculos.ts:70-87` |
| 13 | Apos entrevista completa, agente calcula e envia TMB, hidratacao e creatina e salva em entrevista_dados | VERIFIED | Bloco `proximaEtapa > 7` em `agent.ts:156-203`: calcula, salva `tmb_kcal/tdee_kcal/hidratacao_ml/creatina_g`, envia 3 mensagens |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/services/evolution.ts` | Cliente Evolution API com sendText() | VERIFIED | Existe, exporta `sendText`, usa `env.EVOLUTION_API_URL/KEY`, fetch nativo Node.js 20 |
| `backend/src/routes/webhook.ts` | POST /api/webhook com routing por messageType | VERIFIED | Existe, exporta `webhookRouter`, switch por `messageType`, `fromMe` filtrado, `agentService.processarMensagem` conectado |
| `backend/src/routes/api.ts` | Router central /api com webhook, rag e boas-vindas | VERIFIED | Existe, registra `/webhook`, `/rag`, `/boas-vindas` |
| `backend/src/index.ts` | Registra apiRouter em /api | VERIFIED | `app.use('/api', apiRouter)` presente |
| `supabase/migrations/20260423000005_dieta_chunks.sql` | Tabela dieta_chunks com vector(1536) e funcao match_chunks_paciente | VERIFIED | Existe, CREATE TABLE com FK dieta_id+paciente_id, index HNSW, funcao RPC |
| `backend/src/services/rag.ts` | Pipeline RAG completo com processarDieta() e query() | VERIFIED | Existe, ambas funcoes implementadas e substanciais (download, parse, split, embed, insert, busca RPC) |
| `backend/src/routes/rag.ts` | POST /api/rag/processar com 202 e processamento background | VERIFIED | Existe, exporta `ragRouter`, POST `/processar` retorna 202, fire-and-forget |
| `supabase/migrations/20260423000006_paciente_entrevista.sql` | Colunas entrevista_status, entrevista_dados, entrevista_etapa na tabela pacientes | VERIFIED | Existe, ADD COLUMN IF NOT EXISTS para os 3 campos com tipos e constraints corretos |
| `backend/src/services/conversation.ts` | Estado da entrevista por paciente (getEstado, atualizarEstado) | VERIFIED | Existe, exporta `buscarPacientePorWhatsapp`, `getEstado`, `atualizarEstado` com merge JSONB |
| `backend/src/services/agent.ts` | Logica principal do agente Claude com entrevista e RAG | VERIFIED | Existe, exporta `processarMensagem` e `enviarBoasVindas`, Anthropic SDK conectado, ragQuery importado |
| `backend/src/routes/boas-vindas.ts` | POST /api/boas-vindas/:pacienteId | VERIFIED | Existe, exporta `boasVindasRouter`, POST `/:pacienteId` retorna 202, fire-and-forget |
| `backend/src/services/calculos.ts` | Funcoes puras: calcularTMB, calcularHidratacao, calcularCreatina, formatarMensagemCalculos | VERIFIED | Existe, todas as 4 funcoes exportadas e substanciais, sem I/O externo (funcoes puras) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `backend/src/index.ts` | `backend/src/routes/api.ts` | `app.use('/api', apiRouter)` | WIRED | `index.ts:15` importa e monta `apiRouter` |
| `backend/src/routes/api.ts` | `backend/src/routes/webhook.ts` | `apiRouter.use('/webhook', webhookRouter)` | WIRED | `api.ts:8` |
| `backend/src/routes/webhook.ts` | `backend/src/services/agent.ts processarMensagem()` | `agentService.processarMensagem(phone, text)` | WIRED | `webhook.ts:48` — stub handleText substituido pelo agente real |
| `backend/src/services/agent.ts` | `backend/src/services/rag.ts query()` | `ragQuery(paciente.id, texto)` | WIRED | `agent.ts:212` — chamado no modo agente normal (status completa) |
| `backend/src/services/agent.ts` | `backend/src/services/calculos.ts` | `calcularTMB, calcularHidratacao, calcularCreatina` | WIRED | `agent.ts:13-18` (import) e `agent.ts:167-169` (uso no bloco conclusao) |
| `tabela dietas` | `tabela dieta_chunks` | FK `dieta_id UUID REFERENCES dietas(id)` | WIRED | Migration 005 linha 6 |
| `ragService.query()` | `Supabase RPC match_chunks_paciente` | `supabase.rpc('match_chunks_paciente', {...})` | WIRED | `rag.ts:81` |
| `backend/src/routes/api.ts` | `backend/src/routes/rag.ts` | `apiRouter.use('/rag', ragRouter)` | WIRED | `api.ts:9` |
| `backend/src/routes/api.ts` | `backend/src/routes/boas-vindas.ts` | `apiRouter.use('/boas-vindas', boasVindasRouter)` | WIRED | `api.ts:10` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `agent.ts processarMensagem` | `paciente` | `buscarPacientePorWhatsapp(phone)` chamando Supabase `.from('pacientes')` | Sim — query real ao banco | FLOWING |
| `agent.ts processarMensagem` | `estado` | `getEstado(pacienteId)` chamando Supabase `.from('pacientes').select('entrevista_*')` | Sim — query real ao banco | FLOWING |
| `rag.ts processarDieta` | `text` | `pdfParse(buffer)` sobre PDF baixado do Supabase Storage | Sim — extracao real de PDF | FLOWING |
| `rag.ts query` | `data` | `supabase.rpc('match_chunks_paciente', ...)` | Sim — RPC com busca vetorial real | FLOWING |
| `calculos.ts calcularTMB` | `tmb`, `tdee` | Calculo puro dos dados do paciente — sem I/O | N/A — funcao pura deterministica | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — servicos dependem de Evolution API ativa, Supabase com dados reais e OPENAI_API_KEY com credito. Nenhum endpoint e testavel em isolamento sem mocks ou ambiente Docker em execucao.

---

### Requirements Coverage

| Requirement | Source Plan | Descricao | Status | Evidencia |
|-------------|------------|-----------|--------|-----------|
| AGENT-01 | 02-01 | Webhook recebe payload Evolution API e roteia por tipo de midia | SATISFIED | `webhook.ts` switch por `messageType` cobre texto/audio/imagem |
| AGENT-07 | 02-02 | PDF da dieta processado via LangChain + pgvector como contexto RAG | SATISFIED | `rag.ts` (services) com RecursiveCharacterTextSplitter + OpenAIEmbeddings + dieta_chunks |
| AGENT-08 | 02-03 | Agente envia boas-vindas automatica com nome do cadastro | SATISFIED | `agent.ts` bloco `status === 'pendente'` envia `Ola, ${paciente.nome}!` usando nome do Supabase |
| AGENT-09 | 02-03 | Entrevista coleta: idade, sexo, peso, altura, atividade, suplementos | SATISFIED | 7 etapas implementadas com parsing deterministico em `processarRespostaEntrevista` |
| AGENT-10 | 02-04 | Calcula TMB com formula Mifflin-St Jeor | SATISFIED | `calculos.ts` implementa formula correta com 5 fatores de atividade |
| AGENT-11 | 02-04 | Meta de hidratacao diaria 35ml/kg com distribuicao | SATISFIED | `calcularHidratacao` retorna `peso_kg * 35` com 8 porcoes ao longo do dia |
| AGENT-12 | 02-04 | Dose de creatina 0,03g/kg; respeita dose do nutricionista se definida | SATISFIED | `calcularCreatina` detecta padrao `creatina Xg` nos suplementos; fallback 0.03g/kg |

**Observacao sobre AGENT-01:** O requisito menciona tambem "codigo de barras" como tipo de midia suportado. O webhook atual nao tem um case especifico para `barcodeMessage` — tipos nao reconhecidos caem no `default` (apenas log, sem resposta ao usuario). Esta lacuna esta explicitamente planejada para a Fase 3 (AGENT-05), portanto nao e um gap da Fase 2.

---

### Anti-Patterns Found

| Arquivo | Linha | Pattern | Severidade | Impacto |
|---------|-------|---------|------------|---------|
| `backend/src/routes/webhook.ts` | 52-58 | Stubs para audioMessage e imageMessage retornam mensagem fixa | INFO | Intencional — documentado no SUMMARY como stub para Fase 3 (Groq Whisper e Claude Vision). Nao bloqueia o objetivo da Fase 2. |
| `backend/src/services/agent.ts` | 301 | `setTimeout(resolve, 1500)` — delay artificial de UX | INFO | Intencional — melhora UX de "calculando..." antes de enviar numeros. Nao e stub, e comportamento esperado. |

Nenhum anti-pattern bloqueador encontrado. Os stubs de audio/imagem sao explicitamente marcados com comentario `// Stub Fase 3` e nao impedem o nucleo conversacional texto.

---

### Human Verification Required

#### 1. Fluxo WhatsApp Completo — Onboarding

**Teste:** Enviar mensagem de texto para o numero WhatsApp conectado com um paciente cadastrado (ativo=true) que tenha entrevista_status='pendente'.
**Esperado:** Bot responde com "Ola, [Nome do Paciente]! Sou o NutriChat..." seguido da pergunta 1 da entrevista (idade). Supabase deve mostrar o paciente com `entrevista_status='em_andamento'` e `entrevista_etapa=1`.
**Por que humano:** Requer Evolution API conectada ao WhatsApp, N8N encaminhando o webhook, e paciente real no Supabase.

#### 2. Entrevista Sequencial — 7 Etapas

**Teste:** Completar todas as 7 etapas respondendo perguntas sequencialmente; testar resposta invalida numa etapa (ex: digitar "abc" quando pergunta sobre idade).
**Esperado:** Agente avanca etapa a etapa; resposta invalida repete a pergunta sem avancar; apos etapa 7, envia 3 mensagens: confirmacao + calculos formatados (TMB/TDEE/hidratacao/creatina) + instrucoes de uso. Supabase deve mostrar `entrevista_status='completa'` com `tmb_kcal`, `tdee_kcal`, `hidratacao_ml`, `creatina_g` em `entrevista_dados`.
**Por que humano:** Comportamento conversacional multi-turno requer sessao WhatsApp real com estados persistidos entre mensagens.

#### 3. POST /api/boas-vindas/:pacienteId — Disparo Externo

**Teste:** Chamar `POST http://backend:3001/api/boas-vindas/{uuid-valido}` com um pacienteId de paciente ativo.
**Esperado:** Retorna `202 Accepted` imediatamente; paciente recebe mensagem de boas-vindas no WhatsApp em segundos; `entrevista_status` muda para `em_andamento`.
**Por que humano:** Requer Docker Compose em execucao com Evolution API ativa.

#### 4. Pipeline RAG End-to-End

**Teste:** Fazer upload de um PDF de dieta e chamar POST /api/rag/processar, depois enviar mensagem de texto perguntando sobre a dieta (ex: "qual e minha meta de proteina?").
**Esperado:** POST retorna 202; chunks sao criados na tabela `dieta_chunks` (verificar no Supabase Dashboard); ao perguntar sobre a dieta, agente responde com base no conteudo do PDF (contexto RAG presente na resposta do Claude).
**Por que humano:** Requer OPENAI_API_KEY valida com credito para gerar embeddings e ambiente completo com Supabase Storage.

---

### Gaps Summary

Nenhum gap tecnico identificado. Todos os 13 must-haves verificados com artifacts existentes, substanciais e conectados. O codigo implementa exatamente o descrito nos PLANs.

Os 4 itens de verificacao humana sao necessarios porque o nucleo do sistema depende de integracao WhatsApp (Evolution API), banco de dados real (Supabase) e API externa paga (OpenAI) — nenhum pode ser verificado por grep ou analise estatica de codigo.

---

_Verified: 2026-04-23T23:59:00Z_
_Verifier: Claude (gsd-verifier)_
