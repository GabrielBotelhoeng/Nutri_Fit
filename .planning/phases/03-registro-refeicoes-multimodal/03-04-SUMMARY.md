---
phase: 3
plan: "03-04"
title: "Migration RPC acumular_registro_diario"
status: complete
completed_at: "2026-04-25T00:00:00Z"
tasks_completed: 1
tasks_total: 1

provides:
  - "supabase RPC acumular_registro_diario — soma incremental ON CONFLICT para registros_diarios"

key-files:
  created:
    - supabase/migrations/20260425000001_add_acumular_registro.sql

decisions:
  - "SECURITY DEFINER para garantir acesso service_role"
  - "REVOKE + GRANT ao service_role para limitar acesso"
  - "Soma incremental via ON CONFLICT DO UPDATE SET x = x + EXCLUDED.x"

deviations: []

self-check: PASSED

notes: |
  Migration criada e commitada. PENDENTE aplicação manual no Supabase SQL Editor
  (supabase CLI não disponível, sem DATABASE_URL no .env).
  
  Para aplicar: acesse https://supabase.com/dashboard/project/iqpoohthfhmjkvrqxzns/sql/new
  e execute o conteúdo de supabase/migrations/20260425000001_add_acumular_registro.sql
---

## Summary

Migration 007 criada com a RPC `acumular_registro_diario`.

### O que foi construído

Função PostgreSQL com `INSERT ... ON CONFLICT DO UPDATE SET` que soma macros incrementalmente — evita o pitfall crítico do Supabase `upsert()` que sobrescreveria registros anteriores do dia.

### Detalhes técnicos

- Parâmetros: `p_paciente_id UUID, p_data DATE, p_kcal, p_proteina_g, p_carbo_g, p_gordura_g NUMERIC`
- `ON CONFLICT (paciente_id, data)` → soma os valores ao invés de sobrescrever
- `SECURITY DEFINER` + `GRANT EXECUTE TO service_role`

### Pendência

Aplicar no Supabase Cloud via SQL Editor antes de testar os planos 03-01 e 03-03.
