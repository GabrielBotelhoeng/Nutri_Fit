-- SEC-3: fechar RLS aberta. Antes:
--   * pacientes/dietas/refeicoes/registros_diarios/alertas_config tinham
--     `FOR ALL TO authenticated USING(true)` — qualquer usuario logado no
--     Supabase Auth tinha acesso total a todos os pacientes.
--   * storage.objects do bucket `dietas` tinha politicas amplas pra
--     authenticated (upload/read/delete em qualquer objeto do bucket).
--   * mensagens_processadas e conversa_historico foram criadas SEM
--     `ENABLE ROW LEVEL SECURITY` — acesso default era aberto pra anon
--     e authenticated com a chave publica.
--
-- Modelo de acesso: o sistema e single-tenant. Backend Express usa
-- SUPABASE_SERVICE_KEY (bypass automatico de RLS). O painel chama o
-- backend autenticado via JWT (SEC-1), nunca consulta Supabase direto.
-- Logo, authenticated/anon nao precisam de NENHUM acesso a tabelas de
-- negocio nem ao bucket de dietas — fechar tudo eh seguro e preserva
-- defesa-em-profundidade pra qualquer demo publica.

-- ----------------------------------------------------------------------
-- 1. Dropar policies amplas em tabelas de negocio (migration 003)
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_full_access_pacientes"        ON pacientes;
DROP POLICY IF EXISTS "authenticated_full_access_dietas"           ON dietas;
DROP POLICY IF EXISTS "authenticated_full_access_refeicoes"        ON refeicoes;
DROP POLICY IF EXISTS "authenticated_full_access_registros_diarios" ON registros_diarios;
DROP POLICY IF EXISTS "authenticated_full_access_alertas_config"   ON alertas_config;

-- ----------------------------------------------------------------------
-- 2. Dropar policies do bucket `dietas` (migration 004)
-- O painel nunca sobe PDF direto pelo supabase-js — sobe via backend
-- (que usa service_role). Fechar.
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_upload_dietas" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_dietas"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_dietas" ON storage.objects;

-- ----------------------------------------------------------------------
-- 3. Habilitar RLS em tabelas criadas sem (P2-7, P2-9)
-- Sem policies, anon e authenticated ficam negados por default;
-- service_role do backend continua bypassando.
-- ----------------------------------------------------------------------
ALTER TABLE mensagens_processadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa_historico    ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------
-- 4. dieta_chunks: mantido como esta.
-- A policy `paciente_read_own_chunks` (paciente_id = auth.uid()) e
-- estreita o suficiente — pacientes nao logam no Supabase Auth hoje,
-- mas se passarem a logar, so verao seus proprios chunks.
-- ----------------------------------------------------------------------

COMMENT ON TABLE pacientes IS
  'SEC-3: RLS ON, nenhuma policy pra authenticated/anon. Acesso via backend com service_role.';
COMMENT ON TABLE mensagens_processadas IS
  'P2-7 + SEC-3: dedup de eventos do webhook Evolution. RLS ON, sem policies — service_role only.';
COMMENT ON TABLE conversa_historico IS
  'P2-9 + SEC-3: historico de turnos da conversa paciente <-> agente Claude. RLS ON, sem policies — service_role only.';
