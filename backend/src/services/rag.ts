import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import pdfParse from 'pdf-parse';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

// maxRetries/timeout explicitos: default do AsyncCaller pode mudar entre versoes.
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small',
  maxRetries: 6,
  timeout: 30000,
});

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Compartilhado por processarDieta e extrairHorariosDieta — PDF baixado uma vez so.
export async function baixarTextoPDF(pdfUrl: string): Promise<string> {
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

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const parsed = await pdfParse(buffer);
  const text = parsed.text;

  if (!text.trim()) {
    throw new Error('PDF sem texto extraivel (pode ser imagem escaneada)');
  }
  return text;
}

export async function processarDieta(
  pacienteId: string,
  dietaId: string,
  pdfUrl: string,
  textoPreExtraido?: string,
): Promise<void> {
  console.log(`[rag] Processando dieta ${dietaId} para paciente ${pacienteId}`);

  try {
    const text = textoPreExtraido ?? (await baixarTextoPDF(pdfUrl));

    const chunks = await splitter.splitText(text);
    console.log(`[rag] ${chunks.length} chunks gerados para dieta ${dietaId}`);

    const batchSize = 20;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = await embeddings.embedDocuments(batch);
      allEmbeddings.push(...batchEmbeddings);
    }

    // Re-processamento idempotente.
    await supabase.from('dieta_chunks').delete().eq('dieta_id', dietaId);

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
    // Best-effort: se o supabase tambem cair, perdemos so o status, nao o erro original.
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

// Schema rigido: 5 chaves sempre presentes, "HH:MM" 24h zero-padded OU null.
// Extrai APENAS horarios literalmente escritos no PDF (nunca infere).
export interface HorariosDieta {
  cafe: string | null;
  lanche_manha: string | null;
  almoco: string | null;
  lanche_tarde: string | null;
  jantar: string | null;
}

const HORARIOS_KEYS_DIETA = ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar'] as const;

export function horariosDietaVazio(): HorariosDieta {
  return { cafe: null, lanche_manha: null, almoco: null, lanche_tarde: null, jantar: null };
}

// Normaliza "7h" / "7:30" / "07h00" / "12h30" para "HH:MM" 24h.
// Retorna null se hora fora de range ou formato invalido.
export function normalizarHora(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  if (t.length === 0) return null;

  const m = t.match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?\s*(?:h|min)?$/);
  if (!m) {
    // Haiku as vezes corta o "h" e devolve so o numero.
    const justNum = t.match(/^(\d{1,2})$/);
    if (!justNum) return null;
    const h = parseInt(justNum[1], 10);
    if (h < 0 || h > 23) return null;
    return `${h.toString().padStart(2, '0')}:00`;
  }
  const h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

const SYSTEM_PROMPT_HORARIOS = `Voce extrai horarios de refeicoes do texto de um PDF de dieta prescrita por nutricionista.

REGRA NUMERO 1: extraia APENAS horarios LITERALMENTE escritos no texto.
- NUNCA infira ("almoco proximo do meio-dia" → null, NAO "12:00")
- NUNCA arredonde ou calcule
- NUNCA preencha por bom senso (se a refeicao nao aparece com horario, e null)

Mapeie cada refeicao para uma das 5 chaves:
- "cafe": cafe da manha, primeira refeicao do dia, "manha"
- "lanche_manha": lanche da manha, colacao, intermediaria entre cafe e almoco
- "almoco": almoco
- "lanche_tarde": lanche da tarde, merenda
- "jantar": jantar, janta, ceia, ultima refeicao do dia

Formato de saida: JSON estrito, todas as 5 chaves sempre presentes, string "HH:MM" 24h OU null.

Exemplos:
PDF: "Cafe da manha: 7h. Almoco: 12h30. Jantar: 20h"
→ {"cafe":"07:00","lanche_manha":null,"almoco":"12:30","lanche_tarde":null,"jantar":"20:00"}

PDF: "Refeicoes: 7h, 10h, 12h30, 16h, 20h"
→ {"cafe":"07:00","lanche_manha":"10:00","almoco":"12:30","lanche_tarde":"16:00","jantar":"20:00"}

PDF: "Almoco proximo do meio-dia, jantar a noite"
→ {"cafe":null,"lanche_manha":null,"almoco":null,"lanche_tarde":null,"jantar":null}

PDF: "Faca 5 refeicoes ao dia"
→ {"cafe":null,"lanche_manha":null,"almoco":null,"lanche_tarde":null,"jantar":null}

Devolva APENAS o JSON. Nada de texto antes ou depois.`;

export async function extrairHorariosDieta(textoPDF: string): Promise<HorariosDieta> {
  // 8000 chars cobre a primeira pagina de qualquer dieta tipica; horarios ficam na intro.
  const MAX_CHARS = 8000;
  const textoTruncado = textoPDF.length > MAX_CHARS ? textoPDF.slice(0, MAX_CHARS) : textoPDF;

  let raw = '';
  try {
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT_HORARIOS,
      messages: [
        { role: 'user', content: `Texto do PDF da dieta:\n\n${textoTruncado}` },
      ],
    });
    raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  } catch (err) {
    console.error('[rag] Falha ao chamar Haiku para extrair horarios:', err);
    return horariosDietaVazio();
  }

  const limpo = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(limpo);
  } catch {
    console.warn('[rag] Haiku retornou JSON invalido para horarios:', raw.slice(0, 200));
    return horariosDietaVazio();
  }

  const resultado = horariosDietaVazio();
  for (const key of HORARIOS_KEYS_DIETA) {
    const valor = parsed[key];
    if (valor === null) continue;
    const norm = normalizarHora(typeof valor === 'string' ? valor : null);
    if (norm) resultado[key] = norm;
  }
  return resultado;
}

// Falha silenciosa: entrevista cai no fluxo "vazio = pergunta aberta".
export async function salvarHorariosDieta(
  dietaId: string,
  horarios: HorariosDieta,
): Promise<void> {
  const { error } = await supabase
    .from('dietas')
    .update({ horarios_refeicoes: horarios })
    .eq('id', dietaId);
  if (error) {
    console.error(`[rag] Falha ao salvar horarios_refeicoes para dieta ${dietaId}:`, error.message);
  }
}

// Retorna null quando nao ha dieta, extracao nao rodou, ou todos horarios sao null.
export async function buscarHorariosDietaPaciente(
  pacienteId: string,
): Promise<HorariosDieta | null> {
  const { data, error } = await supabase
    .from('dietas')
    .select('horarios_refeicoes')
    .eq('paciente_id', pacienteId)
    .eq('status', 'ativa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.horarios_refeicoes) return null;

  const h = data.horarios_refeicoes as HorariosDieta;
  const todosNull = HORARIOS_KEYS_DIETA.every((k) => h[k] === null);
  return todosNull ? null : h;
}

export async function query(pacienteId: string, pergunta: string): Promise<string> {
  // Fail-soft: 429 persistente da OpenAI cai no fluxo "sem contexto" em vez de 500.
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embeddings.embedQuery(pergunta);
  } catch (err) {
    console.error('[rag] Falha ao gerar embedding da pergunta (sem contexto da dieta nesta resposta):', err);
    return '';
  }

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
