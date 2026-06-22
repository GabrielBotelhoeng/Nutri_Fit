-- Migration 004: Bucket 'dietas' no Supabase Storage com acesso restrito

-- Criar bucket para PDFs das dietas (acesso restrito — nao publico)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dietas',
  'dietas',
  false,
  52428800, -- 50 MB por arquivo
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Politica: apenas authenticated pode fazer upload (nutricionista no painel)
CREATE POLICY "authenticated_upload_dietas"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dietas');

-- Politica: authenticated pode ler (painel + backend via token)
CREATE POLICY "authenticated_read_dietas"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dietas');

-- Politica: authenticated pode deletar (ao substituir dieta)
CREATE POLICY "authenticated_delete_dietas"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dietas');

-- anon nao tem acesso ao bucket
