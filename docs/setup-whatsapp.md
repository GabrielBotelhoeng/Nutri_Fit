# Conexao WhatsApp via Pairing Code

## Pre-requisitos

- Evolution API rodando (local: http://localhost:8080)
- Numero WhatsApp dedicado disponivel (D-08)
- EVOLUTION_API_KEY configurada (`$EVOLUTION_API_KEY` em dev)

## Passo a passo

### 1. Criar instancia

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "nutrichat", "qrcode": false}'
```

### 2. Solicitar Pairing Code

```bash
curl -X POST http://localhost:8080/instance/connect/nutrichat \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "5511999999999"}'
```

Response: `{ "code": "XXXX-XXXX" }`

### 3. No WhatsApp do numero dedicado

WhatsApp > Configuracoes > Aparelhos conectados > Conectar com numero de telefone

Inserir o pairing code retornado no passo 2.

### 4. Verificar conexao

```bash
curl -H "apikey: $EVOLUTION_API_KEY" \
  http://localhost:8080/instance/connectionState/nutrichat
```

Response esperada: `{ "state": "open" }`

### 5. Configurar webhook para N8N

```bash
curl -X POST http://localhost:8080/webhook/set/nutrichat \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://n8n:5678/webhook/evolution",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }'
```

### 6. Teste final

```bash
curl -X POST http://localhost:8080/message/sendText/nutrichat \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "5511999999999", "text": "NutriChat conectado com sucesso!"}'
```

## Re-conectar WhatsApp (sessao caiu)

Se a instancia perder a conexao (state != "open"), basta repetir os passos 2 e 3:

1. Solicitar novo pairing code (Passo 2)
2. Inserir no WhatsApp (Passo 3)
3. Verificar state = "open" (Passo 4)

Nao e necessario recriar a instancia — ela persiste no banco de dados da Evolution API.

## Producao (Railway)

Em producao, substituir:
- `http://localhost:8080` pela URL publica da Evolution API no Railway
- `http://n8n:5678` pela URL publica do N8N no Railway
- `$EVOLUTION_API_KEY` pela chave configurada nas Railway Variables (`EVOLUTION_API_KEY`)

## Troubleshooting

| Sintoma | Causa Provavel | Solucao |
|---------|---------------|---------|
| `state: "close"` apos pairing | Codigo expirou (valido 60s) | Repetir passos 2 e 3 |
| `401 Unauthorized` | API key errada | Verificar `AUTHENTICATION_API_KEY` no .env |
| Webhook nao dispara | URL incorreta | Verificar `WEBHOOK_GLOBAL_URL` no .env |
| N8N nao recebe | Servico N8N parado | `docker compose ps n8n` e reiniciar |
