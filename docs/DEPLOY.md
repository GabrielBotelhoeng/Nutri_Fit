# NutriChat — Deploy final e smoke test

Referência única do que está no ar, como reimplantar cada peça e como
validar que a stack inteira está saudável.

**Última validação E2E:** 2026-07-18 (3/3 mensagens no WhatsApp real do Gabriel).

## Mapa de deploy

Toda a stack roda em nuvem. O PC do desenvolvedor pode ficar desligado.

| Serviço | Host | App / URL | Auto-deploy |
|---|---|---|---|
| Backend (agente) | Fly.io — região `gru` | `nutrichat-backend` — https://nutrichat-backend.fly.dev | não (`fly deploy` manual) |
| Painel do nutricionista | Vercel | https://nutrichat-painel.vercel.app | sim (push em `main` do monorepo) |
| Landing page | Vercel | https://nutrichat-landing.vercel.app | sim (push em `main` do repo separado `Nutri_Fit_Land_Page`) |
| Evolution API v2 (WhatsApp) | Fly.io | `nutrichat-evolution` — https://nutrichat-evolution.fly.dev | não |
| N8N (crons) | Fly.io | `nutrichat-n8n` — https://nutrichat-n8n.fly.dev | não |
| Postgres dedicado (Evolution) | Fly.io | interno | não |
| Supabase (dados do NutriChat) | Supabase Cloud | dashboard | — |

## Como reimplantar cada peça

### Backend (Fly.io)

```bash
cd backend
fly deploy                            # build + release
fly logs                              # cauda em tempo real
fly ssh console -a nutrichat-backend  # shell no container
fly secrets set FOO=bar               # sem redeploy explícito
```

Config em `backend/fly.toml`. Porta interna 3001, força HTTPS,
`auto_stop_machines = "stop"` → cold start ~2s na primeira msg.

### Painel (Vercel)

Push em `main` do repo raiz (subpasta `nutrichat-painel/`) — Vercel
detecta o Vite e faz build+deploy automático. Alternativa manual:

```bash
cd nutrichat-painel
vercel --prod
```

### Landing (Vercel)

Push em `main` do repo separado
`git@github.com:GabrielBotelhoeng/Nutri_Fit_Land_Page.git`. Vercel detecta
o Next.js e faz build+deploy automático.

```bash
cd ../nutrichat-landing
vercel --prod   # manual, raro
```

### Evolution API v2 (Fly.io)

```bash
cd deploy/evolution
fly deploy
```

Imagem: `evoapicloud/evolution-api:v2.3.7`. Banco: Postgres dedicado no
Fly (não compartilha com o NutriChat).

Após deploy, se WhatsApp desconectar, ir em https://nutrichat-evolution.fly.dev/manager
e parear via QR novamente.

### N8N (Fly.io)

```bash
cd deploy/n8n
fly deploy
```

Imagem: `n8nio/n8n:latest`. Banco: SQLite persistente em volume Fly.
UI: https://nutrichat-n8n.fly.dev (basic auth).

Importar workflows via script:

```bash
node scripts/import-n8n-workflows.mjs   # lê n8n/workflows/*.json
```

Cron IDs ativos (confirmados 2026-07-18):
- `y0B9QdWn3PMe28kH` — alertas 15/15min
- expiração de plano — diário 09:00 BRT
- relatório semanal — domingo 08:00 BRT

## Variáveis de ambiente por serviço

### Backend (Fly secrets — `fly secrets list -a nutrichat-backend`)

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
CLAUDE_API_KEY
GROQ_API_KEY
OPENAI_API_KEY
EVOLUTION_API_URL=https://nutrichat-evolution.fly.dev
EVOLUTION_API_KEY
EVOLUTION_WEBHOOK_SECRET
INTERNAL_API_KEY
CORS_ORIGIN=https://nutrichat-painel.vercel.app,https://nutrichat-painel-mdk0bvn1z-gabriel-botelhos-projects.vercel.app,http://localhost:5173
N8N_WEBHOOK_URL=https://nutrichat-n8n.fly.dev
```

### Painel (Vercel — Project → Settings → Environment Variables)

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_BACKEND_URL=https://nutrichat-backend.fly.dev
```

### Landing (Vercel)

```
NEXT_PUBLIC_WHATSAPP_NUMBER=556292058735   # ou o número do nutri real
NEXT_PUBLIC_NUTRI_PRIMEIRO_NOME
NEXT_PUBLIC_NUTRI_NOME_COMPLETO
NEXT_PUBLIC_NUTRI_INICIAIS
NEXT_PUBLIC_NUTRI_MARCA
NEXT_PUBLIC_NUTRI_CRN
NEXT_PUBLIC_NUTRI_CRN_SIGLA
NEXT_PUBLIC_NUTRI_ESPECIALIDADE
NEXT_PUBLIC_NUTRI_ESPECIALIDADE_INLINE
NEXT_PUBLIC_NUTRI_ARTIGO
NEXT_PUBLIC_NUTRI_PRONOME
NEXT_PUBLIC_NUTRI_REGISTRADO
```

Se qualquer `NEXT_PUBLIC_NUTRI_*` estiver ausente, a landing usa o
placeholder `Camila Rocha` (modo demo).

## Smoke test E2E

Rode em ordem. Qualquer passo que falhar quebra os seguintes.

### 1. Health checks (sem dependência)

```bash
curl -sI https://nutrichat-backend.fly.dev/health         # 200
curl -sI https://nutrichat-evolution.fly.dev             # 200 ou 401 (manager exige login)
curl -sI https://nutrichat-n8n.fly.dev                   # 401 (basic auth ativo)
curl -sI https://nutrichat-painel.vercel.app             # 200
curl -sI https://nutrichat-landing.vercel.app            # 200
```

### 2. Autenticação de endpoints protegidos

```bash
# Webhook sem secret → 401
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://nutrichat-backend.fly.dev/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert"}'
# esperado: 401

# Cron sem chave → 401
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://nutrichat-backend.fly.dev/api/alertas/disparar
# esperado: 401
```

### 3. Fluxo WhatsApp real (manual)

1. **Cadastro** — abrir o painel, criar paciente com um número real e anexar PDF de dieta.
2. **Boas-vindas** — em segundos, o WhatsApp do paciente recebe a msg inicial do agente.
3. **Onboarding** — responder as 14 etapas (idade → sexo → peso → altura → atividade → suplementos → horários).
4. **Registro de refeição** — mandar foto de um prato → agente devolve card D-06 com kcal + P/C/G.
5. **Alerta** — esperar até o próximo múltiplo de 15min do horário de refeição cadastrado → WhatsApp recebe lembrete.

Log esperado no backend:

```bash
fly logs -a nutrichat-backend | grep -E "(webhook|agent|alertas)"
# [webhook] recebido de 5562...
# [agent] intent=registro_refeicao
# [alertas] jantar enviado
```

### 4. Cross-check via banco

```bash
# Supabase SQL Editor
SELECT COUNT(*) FROM registros_diarios WHERE data = CURRENT_DATE;
SELECT paciente_id, MAX(created_at) FROM refeicoes GROUP BY paciente_id;
```

## Diagnóstico rápido de bugs comuns

| Sintoma | Provável causa | Onde olhar |
|---|---|---|
| `Failed to fetch` no painel + cards zerados | `CORS_ORIGIN` do backend não tem a URL do painel | `fly secrets list -a nutrichat-backend` |
| WhatsApp não responde | Evolution desconectou | https://nutrichat-evolution.fly.dev/manager → parear QR |
| Alertas não disparam | Cron N8N pausado ou config vazia | UI N8N → workflow `y0B9QdWn3PMe28kH` (active=t?) + tabela `alertas_config` do paciente |
| Landing mostra "Camila" | `NEXT_PUBLIC_NUTRI_*` não populadas no Vercel | Vercel → Settings → Env Vars |
| 401 no webhook (Evolution v1 legado) | Header `X-Webhook-Secret` errado ou missing | `EVOLUTION_WEBHOOK_SECRET` bate no Fly? |

## Rollback

- **Backend Fly:** `fly releases -a nutrichat-backend` → `fly releases rollback <version>`
- **Painel/Landing Vercel:** Vercel → Deployments → clicar num deploy anterior → "Promote to Production"
- **Evolution/N8N Fly:** mesmo padrão do backend, `fly releases`

## Referências

- `backend/README.md` — endpoints e stack
- `nutrichat-painel/README.md` — painel (Vite + Vercel)
- `nutrichat-landing/README.md` — landing (Next.js + Vercel) *(repo separado)*
- `.env.example` (raiz) — vars locais
- Fase 6 SUMMARY — `.planning/phases/06-landing-page/06-03-SUMMARY.md`
