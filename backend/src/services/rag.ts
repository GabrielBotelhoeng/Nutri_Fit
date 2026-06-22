import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import pdfParse from 'pdf-parse';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small',
});

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

export async function processarDieta(
  pacienteId: string,
  dietaId: string,
  pdfUrl: string,
): Promise<void> {
  console.log(`[rag] Processando dieta ${dietaId} para paciente ${pacienteId}`);

  try {
    // 1. Baixar PDF do Supabase Storage
    const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/dietas/`;
    if (!pdfUrl.startsWith(STORAGE_PREFIX)) {
      throw new Error(`pdfUrl invalida: deve ser do bucket 'dietas'. Recebido: ${pdfUrl}`);
    }
    const path = pdfUrl.slice(STORAGE_PREFIX.length);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('dietas')
      .download(path);

    if (downloadError || !fileData) {
      throw new Error(`Falha ao baixar PDF: ${downloadError?.message}`);
    }

    // 2. Extrair texto do PDF
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text = parsed.text;

    if (!text.trim()) {
      throw new Error('PDF sem texto extraivel (pode ser imagem escaneada)');
    }

    // 3. Dividir em chunks
    const chunks = await splitter.splitText(text);
    console.log(`[rag] ${chunks.length} chunks gerados para dieta ${dietaId}`);

    // 4. Gerar embeddings em lotes de 20 (evitar rate limit)
    const batchSize = 20;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = await embeddings.embedDocuments(batch);
      allEmbeddings.push(...batchEmbeddings);
    }

    // 5. Remover chunks anteriores da mesma dieta (re-processamento idempotente)
    await supabase.from('dieta_chunks').delete().eq('dieta_id', dietaId);

    // 6. Inserir novos chunks
    const rows = chunks.map((content, i) => ({
      dieta_id: dietaId,
      paciente_id: pacienteId,
      chunk_index: i,
      content,
      embedding: JSON.stringify(allEmbeddings[i]),
    }));

    const { error: insertError } = await supabase.from('dieta_chunks').insert(rows);
    if (insertError) {
      throw new Error(`Falha ao inserir chunks: ${insertError.message}`);
    }

    await supabase
      .from('dietas')
      .update({ processamento_status: 'indexado' })
      .eq('id', dietaId);

    console.log(`[rag] Dieta ${dietaId} indexada com ${chunks.length} chunks`);
  } catch (err) {
    // Persiste falha para o painel parar de mostrar "processando" indefinidamente.
    // Update e best-effort: se o supabase tambem estiver fora, perdemos so o status,
    // nao o erro original.
    await supabase
      .from('dietas')
      .update({ processamento_status: 'falhou' })
      .eq('id', dietaId)
      .then(({ error }) => {
        if (error) console.error(`[rag] Falha ao marcar dieta ${dietaId} como falhou:`, error);
      });
    throw err;
  }
}

export async function query(pacienteId: string, pergunta: string): Promise<string> {
  const queryEmbedding = await embeddings.embedQuery(pergunta);

  const { data, error } = await supabase.rpc('match_chunks_paciente', {
    query_embedding: JSON.stringify(queryEmbedding),
    p_paciente_id: pacienteId,
    match_threshold: 0.4,
    match_count: 5,
  });

  if (error) {
    console.error('[rag] Erro na busca:', error);
    return '';
  }

  if (!data || data.length === 0) {
    return '';
  }

  return (data as { content: string }[]).map((r) => r.content).join('\n\n');
}
