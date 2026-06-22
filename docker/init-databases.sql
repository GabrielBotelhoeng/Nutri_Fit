-- nutrichat é criado automaticamente pelo POSTGRES_DB env var
-- Este script cria os bancos adicionais necessários

SELECT 'CREATE DATABASE n8n'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec

SELECT 'CREATE DATABASE evolution_api'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution_api')\gexec
