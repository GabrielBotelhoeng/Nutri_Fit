---
phase: 04-alertas-expiracao-relatorio-semanal
plan: 03
status: DONE
completed_at: 2026-04-25
---

# SUMMARY — 04-03: Relatório Semanal + Registro de Água

## O que foi implementado

### RPC Supabase (migration 003)
- `registrar_agua_diaria(p_paciente_id, p_data, p_agua_ml)` — acumula água com ON CONFLICT
- Aplicada via `supabase db push` (junto com migrations 001 e 002 pendentes)

### backend/src/services/relatorio.ts (novo)
- `gerarRelatorioSemanal()` — agrega registros_diarios dos últimos 7 dias por paciente ativo
- Busca `tdee_kcal` de `conversation_states` (fallback: 2000 kcal)
- Conta dias que bateram >= 90% da meta de kcal
- Gera mensagem motivacional via Claude Haiku (texto puro, sem JSON)
- Envia relatório formatado via WhatsApp; paciente sem dados recebe aviso amigável

### backend/src/routes/relatorio.ts (novo)
- `POST /semanal` — protegido por `requireInternalKey`, retorna 202 e processa async

### backend/src/routes/agua.ts (novo)
- `POST /registrar` — protegido por `requireInternalKey`, valida `agua_ml` (1–5000)
- Chama RPC `registrar_agua_diaria` no Supabase Cloud

### backend/src/routes/api.ts (atualizado)
- Registrados `relatorioRouter` em `/relatorio` e `aguaRouter` em `/agua`

### backend/src/services/agent.ts (atualizado)
- Função `registrarAgua(pacienteId, aguaMl)` adicionada
- Detecção de mensagens de água via `AGUA_RE` regex + `/agua|bebi|hidrat|bebo/` — verificada ANTES do bloco `ehRegistro` para evitar falsos positivos ("tomei 200g de frango" não dispara)
- Converte: `ml` → direto, `litro` → ×1000, `copo` → ×250ml

### n8n/workflows/nutrichat-cron-relatorio-semanal.json (novo)
- Cron domingo 08:00 (`0 8 * * 0`) chamando `POST /api/relatorio/semanal` com `x-internal-key`

## Verificações passadas

| Verificação | Resultado |
|-------------|-----------|
| `POST /api/relatorio/semanal` sem header | 401 ✅ |
| `POST /api/relatorio/semanal` com header | 202 ✅ |
| `POST /api/agua/registrar` sem header | 401 ✅ |
| Log `[relatorio] Relatorio enviado para Gabriel Botelho De Siqueira` | ✅ |
| `grep registrar_agua_diaria` migration | ✅ |
| `grep AGUA_RE` agent.ts | ✅ |
| `grep 0 8 * * 0` cron JSON | ✅ |

## Testes manuais pendentes (WhatsApp real)
- Enviar "bebi 500ml de água" → deve retornar confirmação de 500ml
- Enviar "bebi 1 litro de água" → deve retornar confirmação de 1000ml
- Enviar "bebi 2 copos de água" → deve retornar confirmação de 500ml
- Confirmar que "tomei 200g de frango" NÃO aciona registro de água
