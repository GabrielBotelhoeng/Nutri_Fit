# Phase 1: Infraestrutura & Ambiente - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 01-infraestrutura-ambiente
**Areas discussed:** Schema do Supabase, TypeScript vs JavaScript, Evolution API, Ambiente de dev local

---

## Schema do Supabase

| Option | Description | Selected |
|--------|-------------|----------|
| Uma linha por paciente | alertas_config com colunas/JSON por tipo. Simples para N8N | ✓ |
| Múltiplas linhas por tipo | Cada alerta é uma linha separada. Mais flexível | |
| Dentro da tabela pacientes | alertas_config como JSONB em pacientes | |

**User's choice:** Uma linha por paciente
**Notes:** Facilidade de consulta nos cron jobs do N8N foi determinante.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Acumula por dia | Uma linha por (paciente, dia). UPDATE a cada refeição | ✓ |
| Registro por refeição individual | Cada refeição é uma linha. SUM() para saldo | |
| Somente na tabela refeições | Sem tabela registros_diarios | |

**User's choice:** Acumula por dia
**Notes:** Simplifica relatório semanal.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Uma dieta ativa por paciente | Status ativa/expirada. RAG usa a ativa | ✓ |
| Histórico completo de dietas | Versão numerada, histórico completo | |
| Dieta é coluna em pacientes | pdf_url em pacientes diretamente | |

**User's choice:** Uma dieta ativa por paciente

---

## TypeScript vs JavaScript

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript | Tipagem, profissional para portfólio | ✓ |
| JavaScript puro | Mais rápido, sem compilador | |

**User's choice:** TypeScript

---

| Option | Description | Selected |
|--------|-------------|----------|
| Node 20 + tsx | Sem compilação em dev, tsc para produção | ✓ |
| Node 20 + ts-node | Clássico, mais lento | |
| Node 22 + native TS (experimental) | Sem dependências extras, instável | |

**User's choice:** Node 20 + tsx

---

## Evolution API

| Option | Description | Selected |
|--------|-------------|----------|
| Docker no Railway | Serviço separado, URL pública fixa | ✓ |
| VPS próprio | Mais controle, custo extra | |
| Já tenho instância rodando | Instância existente | |

**User's choice:** Docker no Railway

---

| Option | Description | Selected |
|--------|-------------|----------|
| Número pessoal (dev/teste) | Para testes, migrar depois | |
| Número dedicado já disponível | Chip/número separado pronto | ✓ |

**User's choice:** Número dedicado já disponível

---

| Option | Description | Selected |
|--------|-------------|----------|
| QR Code | Mais estável, mais comum | |
| Pairing Code (Link Code) | Código de emparelhamento, sem QR | ✓ |

**User's choice:** Pairing Code (Link Code)

---

## Ambiente de dev local

| Option | Description | Selected |
|--------|-------------|----------|
| Conectado ao Railway | Dev local do código, infra no Railway | |
| Docker Compose local | Ambiente completo offline, bom para portfólio | ✓ |

**User's choice:** Docker Compose local
**Notes:** Portfólio se beneficia do Docker Compose (facilita onboarding de quem clonar o repo).

---

| Option | Description | Selected |
|--------|-------------|----------|
| .env local + Railway env vars | Padrão da indústria, .env.example commitado | ✓ |
| Somente Railway env vars | Mais simples, precisa de Railway em dev | |

**User's choice:** .env local + Railway env vars

---

## Claude's Discretion

- Estrutura de pastas do backend Express/TS
- Versões de dependências
- Configuração de RLS no Supabase
- Nomenclatura de serviços no Railway

## Deferred Ideas

Nenhuma — discussão ficou dentro do escopo.
