# Phase 4: Alertas, Expiração & Relatório Semanal — Research

**Pesquisado em:** 2026-04-25
**Domínio:** Cron jobs N8N, lógica de expiração no agente, agregação semanal de dados nutricionais
**Confiança geral:** HIGH — toda a base de código foi lida diretamente; sem inferências não verificadas

---

## Sumário

Esta fase tem **zero trabalho de schema novo**: `alertas_config` e `registros_diarios` já existem com as colunas corretas desde a migration 001, e a RPC `acumular_registro_diario` foi criada na migration 007 (Fase 3). O que precisa ser construído são quatro peças:

1. **Endpoints de backend** que os N8N workflows chamam via HTTP
2. **Workflows N8N** para alertas (cron por horário de paciente), expiração (já existe parcialmente) e relatório semanal
3. **Lógica de bloqueio/aviso no `agent.ts`** — o campo `ativo` já é verificado; falta a verificação de `data_expiracao` para aviso de 3 dias (AGENT-18) e o bloqueio automático no dia do vencimento (AGENT-19 — marcar `ativo = false`)
4. **Serviço de relatório** que agrega `registros_diarios` dos últimos 7 dias e gera mensagem via Claude Haiku

O N8N já tem um workflow de expiração (`nutrichat-cron-expiracao.json`) que chama `POST /api/expiracao/verificar` às 09h, mas esse endpoint não existe ainda no backend. O N8N usa `x-internal-token` como header, porém o backend usa `x-internal-key` — há uma inconsistência a corrigir.

**Recomendação primária:** Implementar na ordem Wave 1 (expiração) → Wave 2 (alertas) → Wave 3 (relatório), pois expiração é mais crítica para o produto e os cron jobs de alertas dependem de dados populados em `alertas_config` pelos pacientes.

---

<phase_requirements>
## Phase Requirements

| ID | Descrição | Suporte da Pesquisa |
|----|-----------|---------------------|
| AGENT-17 | Alertas agendados enviados nos horários configurados: refeições, água, suplementos (cron jobs N8N) | `alertas_config` já tem as colunas `horario_cafe`, `horario_almoco`, `horario_jantar`, `horarios_agua[]`, `horario_suplementos[]`; N8N precisa de workflow e backend precisa de endpoint `/api/alertas/disparar` |
| AGENT-18 | Agente avisa paciente 3 dias antes da expiração do plano | `data_expiracao DATE` já existe em `pacientes`; o cron diário 09h deve chamar endpoint que verifica `data_expiracao - NOW() <= 3` dias e envia WhatsApp |
| AGENT-19 | No vencimento do plano, agente bloqueia e responde apenas informando como renovar | `agent.ts:124` já verifica `paciente.ativo`; basta o cron marcar `ativo = false` quando `data_expiracao < hoje`; mensagem de bloqueio já existe (`"Seu plano expirou. Entre em contato..."`) |
| AGENT-20 | Relatório semanal enviado todo domingo com: total kcal, média de macros, hidratação média, dias que bateram meta e mensagem de incentivo | `registros_diarios` tem todas as colunas necessárias (`kcal_consumido`, `proteina_g`, `carbo_g`, `gordura_g`, `agua_ml`); precisa de endpoint `/api/relatorio/semanal` e cron N8N domingo |
</phase_requirements>

---

## Mapa de Responsabilidade Arquitetural

| Capacidade | Tier Primário | Tier Secundário | Racional |
|------------|--------------|-----------------|---------|
| Cron scheduling (AGENT-17, 18, 20) | N8N (orquestrador) | — | Já é o padrão do projeto; N8N tem ScheduleTrigger nativo |
| Envio de alertas por WhatsApp | Backend (Evolution API) | — | N8N chama endpoint; backend usa `sendText()` já implementado |
| Verificação de expiração + bloqueio | Backend + Supabase | N8N (disparo) | Lógica de negócio fica no backend; N8N só dispara |
| Agregação dos registros_diarios | Supabase (SQL/RPC) | Backend (formatação) | Agregação eficiente via SQL; formatação da mensagem no backend |
| Geração da mensagem de incentivo | Backend (Claude Haiku) | — | Consistente com padrão da Fase 3 (`meal.ts` usa Haiku) |
| Bloqueio de paciente expirado | agent.ts (verificação reativa) + cron (bloqueio proativo) | — | Dupla camada: cron marca `ativo=false`; agent.ts já bloqueia `!paciente.ativo` |

---

## Estado do Código Existente

### O que JÁ EXISTE e NÃO precisa ser criado

**[VERIFIED: leitura direta do código]**

| Item | Arquivo | Detalhe |
|------|---------|---------|
| Verificação `paciente.ativo` | `backend/src/services/agent.ts:124-127` | Bloqueia e envia mensagem de renovação |
| Tabela `alertas_config` com colunas de horário | `supabase/migrations/20260422000001_create_schema.sql:54-65` | `horario_cafe`, `horario_almoco`, `horario_jantar`, `horarios_agua[]`, `horario_suplementos[]`, `ativo BOOLEAN` |
| Tabela `registros_diarios` com `agua_ml` | migration 001:40-52 | `kcal_consumido`, `proteina_g`, `carbo_g`, `gordura_g`, `agua_ml` — tudo que o relatório precisa |
| Campo `data_expiracao DATE` | migration 001:8 | Na tabela `pacientes` |
| Workflow N8N de expiração (cron 09h) | `n8n/workflows/nutrichat-cron-expiracao.json` | Chama `POST http://backend:3001/api/expiracao/verificar` com `x-internal-token` header |
| Middleware de autenticação interna | `backend/src/routes/boas-vindas.ts:7-13` | Usa header `x-internal-key` e `env.INTERNAL_API_KEY` |
| `sendText()` | `backend/src/services/evolution.ts` | Já implementado desde Fase 2 |
| `INTERNAL_API_KEY` no `.env` e `docker-compose.local.yml` | `backend/src/config/env.ts:15`, compose:112 | Valor: `nutrichat_internal_dev_key_2026` |
| RPC `acumular_registro_diario` | migration 007 | Implementada na Fase 3 (não há `agua_ml` nela — ver gap abaixo) |

### O que precisa ser CRIADO

| Item | Tipo | Qual plano |
|------|------|-----------|
| `backend/src/routes/expiracao.ts` | Arquivo novo | 04-02 |
| `backend/src/routes/alertas.ts` | Arquivo novo | 04-01 |
| `backend/src/routes/relatorio.ts` | Arquivo novo | 04-03 |
| `backend/src/services/expiracao.ts` | Arquivo novo | 04-02 |
| `backend/src/services/alertas.ts` | Arquivo novo | 04-01 |
| `backend/src/services/relatorio.ts` | Arquivo novo | 04-03 |
| `n8n/workflows/nutrichat-cron-alertas.json` | Arquivo novo | 04-01 |
| `n8n/workflows/nutrichat-cron-relatorio-semanal.json` | Arquivo novo | 04-03 |
| Registro em `backend/src/routes/api.ts` das novas rotas | Edição | cada plano |
| Migration para `acumular_agua_diaria` RPC | SQL novo | 04-03 |

---

## Gaps de Schema

### Gap 1: RPC `acumular_registro_diario` não tem `agua_ml` [VERIFIED: migration 007]

A RPC da Fase 3 acumula `kcal`, `proteina_g`, `carbo_g`, `gordura_g` — mas não `agua_ml`. O relatório precisa de média de hidratação. Para o relatório funcionar, a coluna `agua_ml` já está na tabela; falta apenas:

**Opção A (recomendada):** Criar RPC separada `registrar_agua_diaria(p_paciente_id, p_data, p_ml)` — responsabilidade única, sem risco de regressão na RPC já em uso pela Fase 3.

**Opção B:** Adicionar `p_agua_ml` à RPC existente — requer que `meal.ts` seja atualizado para passar o parâmetro, o que é escopo de regressão.

**Decisão:** Usar Opção A. A Fase 4 cria a nova RPC.

### Gap 2: `alertas_config` sem `meta_kcal` e `meta_proteina` [VERIFIED: schema]

A tabela `alertas_config` não tem as metas do paciente. As metas (`tdee_kcal`, etc.) estão em `pacientes.entrevista_dados` (JSONB). O serviço de relatório deve buscar `entrevista_dados->>'tdee_kcal'` de `pacientes` para saber a meta diária de kcal. Não é um gap que bloqueia — é apenas onde buscar os dados.

### Gap 3: `alertas_config` não é populada automaticamente no onboarding [VERIFIED: agent.ts]

Ao completar a entrevista (etapa 7), o `agent.ts` não insere uma linha em `alertas_config`. Logo, a tabela estará vazia para todos os pacientes da Fase 2. O Plano 04-01 deve incluir:
- O cron de alertas deve ser resiliente a `alertas_config` vazia (skip silencioso)
- A Fase 5 (painel) é quem vai popular `alertas_config` de verdade
- Para testes, inserir manualmente uma linha de teste

---

## Inconsistência Crítica: Header de Autenticação Interna

**[VERIFIED: leitura direta]**

| Local | Header usado |
|-------|-------------|
| `n8n/workflows/nutrichat-cron-expiracao.json:25` | `x-internal-token` |
| `backend/src/routes/boas-vindas.ts:8` | `x-internal-key` |
| `docker-compose.local.yml:112` | `INTERNAL_API_KEY` |
| `backend/src/config/env.ts:15` | `INTERNAL_API_KEY` |

O workflow N8N usa `x-internal-token` mas o middleware do backend espera `x-internal-key`. **As novas rotas devem usar `x-internal-key`** (padrão do backend). O workflow de expiração existente deve ser corrigido para usar o header certo.

---

## Padrões de Arquitetura

### Padrão 1: Endpoint Interno (cron → backend)

```typescript
// Source: leitura direta de backend/src/routes/boas-vindas.ts
import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-key'] !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Padrão: responder 202 imediatamente, processar de forma assíncrona
router.post('/verificar', requireInternalKey, async (req: Request, res: Response) => {
  res.status(202).json({ status: 'processando' });
  meuServico.executar().catch(err => console.error('[expiracao] Erro:', err));
});
```

### Padrão 2: Enviar mensagem WhatsApp

```typescript
// Source: leitura direta de backend/src/services/evolution.ts (usado em toda a codebase)
import { sendText } from './evolution';
await sendText(paciente.whatsapp, 'mensagem');
```

### Padrão 3: Query Supabase com range de datas

```typescript
// Source: padrão Supabase (ASSUMED — não há exemplo exato no código, mas é a API padrão)
const seteDiasAtras = new Date();
seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

const { data } = await supabase
  .from('registros_diarios')
  .select('*')
  .eq('paciente_id', pacienteId)
  .gte('data', seteDiasAtras.toISOString().slice(0, 10))
  .lte('data', hoje);
```

### Padrão 4: N8N ScheduleTrigger (cron)

```json
// Source: leitura direta de n8n/workflows/nutrichat-cron-expiracao.json
{
  "type": "n8n-nodes-base.scheduleTrigger",
  "parameters": {
    "rule": {
      "interval": [{ "field": "cronExpression", "expression": "0 9 * * *" }]
    }
  }
}
```

### Padrão 5: Bloqueio de expiração em agent.ts

```typescript
// Source: leitura direta de backend/src/services/agent.ts:124-127
// O padrão ATUAL verifica apenas paciente.ativo:
if (!paciente.ativo) {
  await sendText(phone, '⏰ Seu plano expirou. Entre em contato...');
  return;
}

// Para AGENT-18 (aviso 3 dias antes), adicionar ANTES do bloco acima:
const diasParaVencer = Math.ceil(
  (new Date(paciente.data_expiracao).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
);
if (diasParaVencer > 0 && diasParaVencer <= 3) {
  // Não bloqueia — só avisa. Continua processando a mensagem.
  await sendText(phone, `⚠️ Seu plano vence em ${diasParaVencer} dia(s)...`);
}
```

### Padrão 6: Claude Haiku para geração de texto

```typescript
// Source: leitura direta de backend/src/services/meal.ts:52-57
const response = await claude.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 256,
  messages: [{ role: 'user', content: prompt }],
});
```

---

## Análise do N8N Workflow de Expiração Existente

**[VERIFIED: leitura direta de n8n/workflows/nutrichat-cron-expiracao.json]**

O workflow tem dois nós:
1. **ScheduleTrigger**: `0 9 * * *` — dispara todo dia às 09h
2. **HTTP Request**: `POST http://backend:3001/api/expiracao/verificar` com header `x-internal-token: {{ $env.N8N_INTERNAL_TOKEN }}`

**Problemas identificados:**
- Header `x-internal-token` (workflow) vs `x-internal-key` (middleware do backend) — inconsistência
- `$env.N8N_INTERNAL_TOKEN` — essa variável de ambiente não está definida no `docker-compose.local.yml`; o backend usa `INTERNAL_API_KEY` diretamente no container backend, não em N8N
- O endpoint `/api/expiracao/verificar` não existe ainda — deve ser criado no Plano 04-02

**O que o workflow JÁ FAZ CORRETAMENTE:**
- Usa `http://backend:3001` (rede Docker interna) — correto
- Roda diário às 09h — adequado para verificar expiração
- Está em `active: true` — mas como o endpoint não existe, falhará até o Plano 04-02

**O que precisa ser corrigido no workflow:**
- Mudar header de `x-internal-token` para `x-internal-key`
- Passar o valor real do token (hardcoded ou via variável N8N configurada no painel)

---

## Design dos Novos Endpoints

### 04-01: POST /api/alertas/disparar

Chamado pelo N8N em múltiplos crons (um por horário de alerta).

**Lógica:**
1. Buscar todos os pacientes com `alertas_config.ativo = true`
2. Para cada paciente, verificar se o horário atual bate com o horário configurado (tolerância ±5min)
3. Enviar mensagem apropriada via `sendText()`

**Alternativa mais simples (recomendada para v1):** N8N passa o `tipo_alerta` no body (`cafe`, `almoco`, `jantar`, `agua`, `suplemento`) e o backend busca todos que têm aquele horário configurado para o momento atual. Mas como os horários são por paciente e variados, a abordagem mais correta é:

**Abordagem "pull" (recomendada):**
- Endpoint recebe `{ tipo: 'cafe' | 'almoco' | 'jantar' | 'agua' | 'suplemento', horario: 'HH:MM' }`
- Backend busca pacientes cujo `alertas_config.horario_{tipo}` == parâmetro (ou inclui o horário no array)
- N8N tem um workflow que roda a cada hora e chama o endpoint com o horário atual

**Problema com alertas dinâmicos no N8N:** Horários variam por paciente. Para a v1, a solução mais simples é um **cron a cada minuto** no N8N que chama o endpoint com o horário atual, e o backend filtra quem deve receber naquele momento. [ASSUMED — múltiplas abordagens válidas]

### 04-02: POST /api/expiracao/verificar

**Lógica:**
1. Buscar pacientes com `data_expiracao = HOJE` e `ativo = true` → marcar `ativo = false`
2. Buscar pacientes com `data_expiracao = HOJE + 3 dias` e `ativo = true` → enviar aviso

**Nota sobre AGENT-18 (aviso reativo):** Além do aviso proativo via cron, o `agent.ts` deve verificar `data_expiracao` ao processar mensagens (aviso inline). Isso garante que o paciente que não abriu o WhatsApp em 3 dias ainda seja avisado quando abrir.

### 04-03: POST /api/relatorio/semanal

**Lógica:**
1. Buscar todos pacientes com `ativo = true`
2. Para cada um, agregar `registros_diarios` dos últimos 7 dias
3. Calcular: total kcal, médias de macros, hidratação média, dias que bateram meta (kcal_consumido >= tdee_kcal * 0.9)
4. Gerar mensagem motivacional via Claude Haiku
5. Enviar via `sendText()`

---

## Análise da Tabela `alertas_config`

**[VERIFIED: migration 001]**

```sql
CREATE TABLE IF NOT EXISTS alertas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE UNIQUE,
  horario_cafe TEXT,          -- '07:30'
  horario_almoco TEXT,        -- '12:00'
  horario_jantar TEXT,        -- '19:00'
  horarios_agua TEXT[],       -- ARRAY['09:00','11:00','15:00','17:00']
  horario_suplementos TEXT[], -- ARRAY['07:00','21:00']
  ativo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**O schema está COMPLETO para AGENT-17.** Não precisa de migration.

**Lacuna operacional:** Nenhum código atual insere em `alertas_config`. O onboarding não pergunta horários de refeição. Para v1, o plano deve incluir uma inserção de linha padrão quando o onboarding for concluído, ou aceitar que a tabela fica vazia até a Fase 5 (painel do nutricionista vai configurar). A recomendação é: **criar a linha com valores nulos no final do onboarding** (Fase 2 já está completa, mas pode-se inserir via migration de dados ou via endpoint manual para testes).

---

## Análise da Tabela `registros_diarios` para Relatório

**[VERIFIED: migration 001 e 007]**

```sql
-- Dados disponíveis por linha (paciente/data):
kcal_consumido NUMERIC(8,2)
proteina_g     NUMERIC(8,2)
carbo_g        NUMERIC(8,2)
gordura_g      NUMERIC(8,2)
agua_ml        INTEGER        -- meta do relatório
```

**Query de agregação para relatório semanal:**
```sql
SELECT
  COUNT(*)                           AS dias_com_registro,
  SUM(kcal_consumido)               AS total_kcal,
  AVG(kcal_consumido)               AS media_kcal,
  AVG(proteina_g)                   AS media_proteina,
  AVG(carbo_g)                      AS media_carbo,
  AVG(gordura_g)                    AS media_gordura,
  AVG(agua_ml)                      AS media_agua_ml,
  COUNT(*) FILTER (WHERE kcal_consumido >= :meta_kcal * 0.9) AS dias_bateram_meta
FROM registros_diarios
WHERE paciente_id = :id
  AND data >= CURRENT_DATE - INTERVAL '7 days'
  AND data < CURRENT_DATE;
```

Esta query pode ser executada diretamente via Supabase JS client ou como RPC.

---

## Timezone — Pitfall Crítico

**[VERIFIED: docker-compose.local.yml:81]**

O N8N está configurado com `GENERIC_TIMEZONE: America/Sao_Paulo`. Isso significa que:
- Cron `0 9 * * *` no N8N = 09h de Brasília
- O backend recebe a chamada e usa `new Date()` que, em produção Docker Linux, retorna UTC
- `new Date().toISOString().slice(0,10)` retorna a data em UTC, não em Brasília

**Impacto:** Um registro feito às 22h de Brasília (01h UTC do dia seguinte) vai para o dia errado.

**Solução já adotada na Fase 3 (ASSUMED — não há código explícito):** Verificar se `meal.ts` usa UTC ou local. A linha `new Date().toISOString().slice(0, 10)` em `meal.ts:81` retorna UTC. Para usuários brasileiros (UTC-3), entre 21h e 23h59 o registro vai para o dia seguinte no UTC.

**Para a Fase 4:** O relatório semanal que agrega `registros_diarios` deve usar `CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'` no SQL para calcular "últimos 7 dias" corretamente. Ou simplesmente aceitar UTC por consistência com a Fase 3.

**Recomendação:** Manter UTC por consistência com as Fases 2 e 3. Documentar o comportamento.

---

## Armadilhas e Pitfalls

### Pitfall 1: N8N no Docker Windows — tsx watch não recarrega

**O que acontece:** Após editar qualquer TypeScript do backend, o `tsx watch` no Docker (Windows) não detecta a mudança via volume.

**Como evitar:** Sempre executar `docker restart nutrichat_backend` após editar arquivos TypeScript. Já documentado no `CLAUDE.md`.

**Sinal de alerta:** Endpoint chamado pelo N8N retorna 404 mesmo após criar o arquivo — o código antigo ainda está rodando.

### Pitfall 2: N8N não tem acesso à variável `N8N_INTERNAL_TOKEN`

**O que acontece:** O workflow de expiração usa `{{ $env.N8N_INTERNAL_TOKEN }}` mas essa variável não está declarada no `docker-compose.local.yml` para o container N8N.

**Como evitar:** Ou hardcodar o valor no workflow JSON (aceitável para dev local), ou adicionar `N8N_INTERNAL_TOKEN` ao bloco `environment:` do serviço `n8n` no compose.

**Solução recomendada:** Adicionar ao `docker-compose.local.yml`:
```yaml
n8n:
  environment:
    N8N_INTERNAL_TOKEN: ${INTERNAL_API_KEY:-nutrichat_internal_dev_key_2026}
```
E corrigir o workflow para usar `x-internal-key` em vez de `x-internal-token`.

### Pitfall 3: Cron de alertas com granularidade de minutos sobrecarrega N8N

**O que acontece:** Se o cron rodar a cada minuto (para capturar horários exatos por paciente), o N8N vai executar o workflow 1440 vezes por dia, mesmo que não haja alertas para enviar.

**Como evitar:** Usar granularidade de 5 ou 15 minutos no cron. O alerta de refeição com 5-15min de atraso não prejudica a UX.

**Solução:** Cron `*/15 * * * *` — a cada 15 minutos. Endpoint verifica quem tem alerta configurado para HH:00, HH:15, HH:30, HH:45.

### Pitfall 4: Relatório enviado para paciente expirado

**O que acontece:** Se o cron de relatório rodar antes do cron de expiração no domingo, pode enviar relatório para paciente que acabou de expirar.

**Como evitar:** O serviço de relatório filtra `WHERE ativo = true` em `pacientes`. O cron de expiração roda às 09h; o relatório pode rodar às 08h (antes) ou 10h (depois do bloqueio). Recomendação: **relatório às 08h, expiração às 09h**.

### Pitfall 5: `alertas_config` vazia na Fase 4

**O que acontece:** Todos os pacientes cadastrados na Fase 2/3 não têm linha em `alertas_config`. O cron vai buscar `alertas_config WHERE ativo = true` e retornar zero linhas. Nenhum alerta é enviado.

**Como evitar:** O plano deve incluir seed de dados para testes — inserir linha de teste manualmente. O cron deve ser resiliente a zero resultados (sem erro, só log).

### Pitfall 6: Claude Haiku — JSON inválido no relatório

**O que acontece:** Se Claude Haiku retornar texto com markdown ao gerar mensagem de incentivo, o parsing pode falhar.

**Como evitar:** Para a mensagem de incentivo, NÃO usar JSON — pedir texto puro diretamente. O padrão JSON é necessário apenas para macros (como em `meal.ts`); para texto motivacional, usar `response.content[0].text` direto.

---

## Stack Padrão (sem novos pacotes)

**[VERIFIED: leitura direta do código]**

Esta fase não adiciona novos pacotes npm. Reutiliza o que já existe:

| Ferramenta | Uso na Fase 4 | Já instalado? |
|-----------|---------------|--------------|
| `@supabase/supabase-js` | Queries em `alertas_config`, `registros_diarios`, `pacientes` | Sim |
| `@anthropic-ai/sdk` | Mensagem de incentivo no relatório (Claude Haiku) | Sim |
| `express` (Router) | Novas rotas `/expiracao`, `/alertas`, `/relatorio` | Sim |
| N8N ScheduleTrigger | Cron jobs novos | Sim (built-in N8N) |
| N8N HTTP Request | Chamar endpoints do backend | Sim (built-in N8N) |

---

## Não Construir do Zero

| Problema | Não construir | Usar em vez disso | Por quê |
|----------|---------------|-------------------|---------|
| Envio de WhatsApp | Cliente Evolution API próprio | `sendText()` em `services/evolution.ts` | Já testado em produção |
| Autenticação interna | Token personalizado | Padrão `x-internal-key` já em `boas-vindas.ts` | Consistência |
| Acumulação de dados diários | Lógica de upsert | RPC `acumular_registro_diario` (migration 007) | Atomicidade garantida |
| Cron scheduler | Cron no próprio backend (node-cron) | N8N ScheduleTrigger | N8N já é o orquestrador do projeto |

---

## Ordem de Implementação (Waves)

### Wave 1 — Expiração (04-02) — CRÍTICO
Implementar primeiro porque:
- O workflow N8N de expiração já existe mas aponta para endpoint inexistente
- Bloquear pacientes expirados é funcionalidade crítica de segurança do produto
- A lógica em `agent.ts` para AGENT-18 (aviso inline) não adiciona risco de regressão

**Tarefas:**
1. Corrigir `nutrichat-cron-expiracao.json`: header `x-internal-token` → `x-internal-key`
2. Adicionar `N8N_INTERNAL_TOKEN` no `docker-compose.local.yml`
3. Criar `backend/src/services/expiracao.ts`
4. Criar `backend/src/routes/expiracao.ts`
5. Registrar em `api.ts`
6. Adicionar verificação de 3 dias em `agent.ts` (AGENT-18 reativo)

### Wave 2 — Alertas (04-01)
Implementar segundo porque depende de `alertas_config` populada.

**Tarefas:**
1. Criar `backend/src/services/alertas.ts`
2. Criar `backend/src/routes/alertas.ts`
3. Criar `n8n/workflows/nutrichat-cron-alertas.json` (cron a cada 15min)
4. Registrar em `api.ts`
5. Criar migration para inserir linha padrão em `alertas_config` no onboarding (ou seed manual para testes)

### Wave 3 — Relatório Semanal (04-03)
Implementar por último porque depende de dados em `registros_diarios` (Fase 3).

**Tarefas:**
1. Criar migration para RPC `registrar_agua_diaria`
2. Criar `backend/src/services/relatorio.ts`
3. Criar `backend/src/routes/relatorio.ts`
4. Criar `n8n/workflows/nutrichat-cron-relatorio-semanal.json` (cron domingo 08h)
5. Registrar em `api.ts`

---

## Arquitetura do Fluxo de Dados

```
[N8N ScheduleTrigger] ──────────────────────────────────────────────────────────
  │                                                                              │
  │ 0 9 * * * (diário)       */15 * * * * (a cada 15min)   0 8 * * 0 (domingo) │
  │                                                                              │
  ▼                           ▼                               ▼
POST /api/expiracao/verificar  POST /api/alertas/disparar     POST /api/relatorio/semanal
  │                           │                               │
  │ [x-internal-key]          │ [x-internal-key]              │ [x-internal-key]
  ▼                           ▼                               ▼
expiracaoService              alertasService                  relatorioService
  │                           │                               │
  ├─ busca pacientes          ├─ busca alertas_config         ├─ agrega registros_diarios
  │  data_expiracao=hoje      │  WHERE horario=agora          │  últimos 7 dias
  │  → marca ativo=false      │                               │
  ├─ busca data_expiracao     ├─ filtra quem recebe           ├─ calcula médias + dias meta
  │  = hoje+3                 │                               │
  │  → envia aviso            └─ sendText() por paciente      ├─ Claude Haiku → incentivo
  │                                                           │
  └─ sendText() avisos                                        └─ sendText() relatório
                                                              
[WhatsApp → Evolution API → Backend POST /api/webhook]
  │
  ▼
agent.ts:processarMensagem
  │
  ├─ verifica paciente.ativo (AGENT-19 — JÁ IMPLEMENTADO)
  ├─ [NOVO] verifica data_expiracao - hoje <= 3 → envia aviso inline (AGENT-18)
  └─ processa mensagem normalmente
```

---

## Inventário de Estado em Runtime

> Esta é uma fase de novas funcionalidades, não renomeação. Nenhuma migração de dados existentes é necessária.

| Categoria | Itens | Ação necessária |
|-----------|-------|-----------------|
| Dados armazenados | `alertas_config` — zero linhas para pacientes existentes | Seed manual para testes ou inserção no onboarding |
| Configuração de serviço ativo | Workflow N8N `nutrichat-cron-expiracao` — ativo, mas apontando para endpoint inexistente | Corrigir header + criar endpoint |
| Estado do OS | Nenhum (Docker manage) | Nenhuma |
| Secrets/env vars | `INTERNAL_API_KEY` já existe; `N8N_INTERNAL_TOKEN` não existe no compose N8N | Adicionar ao compose |
| Build artifacts | Nenhum extra | Nenhuma |

---

## Disponibilidade do Ambiente

| Dependência | Necessária para | Disponível | Fallback |
|-------------|----------------|------------|---------|
| N8N (porta 5678) | Cron jobs AGENT-17, 18, 20 | Sim (docker-compose) | — |
| Backend (porta 3001) | Todos os endpoints | Sim | — |
| Supabase Cloud | Queries pacientes/registros | Sim | — |
| Evolution API (porta 8081) | sendText() | Sim | — |
| `alertas_config` com dados | AGENT-17 | Vazia (gap) | Seed manual para teste |
| `registros_diarios` com dados | AGENT-20 | Depende da Fase 3 estar executada | Relatório retorna "sem dados" |

---

## Validação (Nyquist)

### Framework de Testes
| Propriedade | Valor |
|-------------|-------|
| Framework | Não identificado no backend — sem `jest.config.*`, `vitest.config.*` ou `package.json` test script verificado |
| Arquivo de config | Nenhum identificado |
| Comando rápido | `docker exec nutrichat_backend tsx src/test-manual.ts` (teste manual) |
| Testes automatizados | Não há infraestrutura de testes na Fase 3 |

### Mapa Requisitos → Testes

| REQ-ID | Comportamento | Tipo de teste | Automatizável |
|--------|--------------|---------------|--------------|
| AGENT-17 | Paciente recebe alerta no horário configurado | Integração / manual | Manual (requer WhatsApp real + esperar horário) |
| AGENT-18 | Paciente recebe aviso 3 dias antes | Integração / manual | Semi-auto: chamar `POST /api/expiracao/verificar` com data_expiracao=hoje+3 em DB de teste |
| AGENT-19 | Paciente bloqueado no vencimento | Integração / manual | Semi-auto: setar data_expiracao=hoje, chamar endpoint, tentar enviar mensagem |
| AGENT-20 | Relatório semanal enviado domingo | Integração / manual | Semi-auto: chamar `POST /api/relatorio/semanal` manualmente |

### Gaps de Teste (Wave 0)
- Não há infraestrutura de testes automatizados no projeto — consistente com as Fases 1-3
- Testes são manuais via curl + WhatsApp real
- Cada plano deve incluir comandos curl de verificação

---

## Domínio de Segurança (ASVS Nível 1)

| Categoria ASVS | Aplica | Controle |
|----------------|--------|---------|
| V4 Controle de Acesso | Sim | Middleware `requireInternalKey` em todos os endpoints internos |
| V5 Validação de Entrada | Sim | Validar `tipo` e `horario` no body de `/api/alertas/disparar` |
| V2 Autenticação | Não | Endpoints internos (N8N → backend), não usuário final |

### Padrões de Ameaça

| Padrão | STRIDE | Mitigação padrão |
|--------|--------|-----------------|
| Chamada direta aos endpoints internos por terceiros | Spoofing | `x-internal-key` obrigatório |
| Injeção via `horario` no body de alertas | Tampering | Validar formato `HH:MM` com regex antes de usar em query SQL |
| Relatório enviado para paciente errado | Tampering | Sempre filtrar por `paciente.ativo = true` + nunca aceitar `pacienteId` do body N8N |

---

## Premissas (ASSUMED)

| # | Afirmação | Seção | Risco se errado |
|---|-----------|-------|-----------------|
| A1 | A Fase 3 está completa e `registros_diarios` tem dados para pelo menos um paciente | Relatório semanal | Relatório não tem dados para agregar; retorna "sem registros esta semana" |
| A2 | A abordagem de cron a cada 15min para alertas é aceitável para UX (alertas com até 15min de atraso) | Alertas | Requer cron por minuto se precisão for necessária |
| A3 | Para v1, `alertas_config` será populada manualmente para testes (Fase 5 o faz via painel) | Alertas | Nenhum alerta enviado na Fase 4 sem seed |
| A4 | UTC é aceitável para data de registro (consistente com Fases 2 e 3) | Relatório | Registros entre 21h-23h59 Brasília vão para o dia seguinte no relatório |

---

## Fontes

### Primárias (HIGH — leitura direta do código)
- `supabase/migrations/20260422000001_create_schema.sql` — schema completo de `alertas_config` e `registros_diarios`
- `supabase/migrations/20260425000001_add_acumular_registro.sql` — RPC existente sem `agua_ml`
- `n8n/workflows/nutrichat-cron-expiracao.json` — workflow existente com inconsistência de header
- `backend/src/services/agent.ts` — lógica atual de bloqueio e onde adicionar AGENT-18
- `backend/src/services/meal.ts` — padrão de acumulação, Claude Haiku, `formatarSaldoDia`
- `backend/src/routes/boas-vindas.ts` — padrão de middleware de autenticação interna
- `backend/src/config/env.ts` — variáveis disponíveis
- `docker-compose.local.yml` — `GENERIC_TIMEZONE: America/Sao_Paulo` para N8N; `N8N_INTERNAL_TOKEN` ausente

### Secundárias (MEDIUM)
- `CLAUDE.md` — `docker restart nutrichat_backend` necessário após editar TypeScript
- `.planning/config.json` — `nyquist_validation: true`, `security_enforcement: true`, `security_asvs_level: 1`

---

## Metadata

**Breakdown de confiança:**
- Schema / dados existentes: HIGH — lidos diretamente das migrations
- Inconsistência de header: HIGH — verificada em dois arquivos
- Lógica de expiração: HIGH — `agent.ts` lido completamente
- Abordagem de cron para alertas dinâmicos: MEDIUM — A1-A3 são premissas de design
- Relatório semanal — query de agregação: MEDIUM — padrão Supabase, não testado neste codebase

**Data da pesquisa:** 2026-04-25
**Válido até:** 2026-05-25 (stack estável)
