import { Groq } from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';
import { env } from '../config/env';
import { processarMensagem } from './agent';
import { sendText } from './evolution';

const INSTANCE = 'nutrichat';
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// Baixa mídia da Evolution API e retorna Buffer + mimetype.
// ATENÇÃO: logar response keys na primeira execução para confirmar estrutura real (Assumption A1).
// Exportado para reutilização em vision.ts.
export async function downloadMedia(messageId: string): Promise<{ buffer: Buffer; mimetype: string }> {
  const url = `${env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.EVOLUTION_API_KEY },
    body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
  });

  if (!response.ok) {
    throw new Error(`[audio] Falha ao baixar mídia ${messageId}: ${response.status}`);
  }

  const raw = await response.json() as Record<string, unknown>;
  console.log('[audio] downloadMedia response keys:', Object.keys(raw));

  const base64 = raw['base64'] as string;
  const mimetype = (raw['mimetype'] as string) ?? 'audio/ogg';
  return { buffer: Buffer.from(base64, 'base64'), mimetype };
}

// Transcreve áudio via Groq Whisper.
// Pitfall 2: WhatsApp envia mimetype "audio/ogg; codecs=opus" — limpar antes de usar.
// Exportado para uso em testes unitários.
export async function transcreverAudio(buffer: Buffer, mimetype: string): Promise<string> {
  const mimeClean = mimetype.split(';')[0].trim();
  const ext = mimeClean.split('/')[1] ?? 'ogg';
  const audioFile = await toFile(buffer, `audio.${ext}`, { type: mimeClean });

  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-large-v3-turbo',
    language: 'pt',
    response_format: 'text',
    temperature: 0.0,
  });

  return transcription as unknown as string;
}

// Ponto de entrada chamado pelo webhook.ts para mensagens de áudio.
// Delegar pro processarMensagem (roteamento completo do agente) em vez de
// processarTextoRefeicao direto: áudio passa pelas mesmas camadas do texto —
// bloqueio de plano expirado, entrevista por voz, classificador de intenção
// (P1-3), correção (P0-1), saldo, água e consulta RAG. O atalho antigo
// tratava TODO áudio como registro de refeição: resposta de entrevista por
// voz sumia, correção por áudio duplicava a refeição (o double-count do
// P0-1 seguia vivo nesse fluxo) e consulta por áudio ficava sem resposta.
export async function processarAudio(phone: string, messageId: string): Promise<void> {
  try {
    const { buffer, mimetype } = await downloadMedia(messageId);
    const texto = (await transcreverAudio(buffer, mimetype)).trim();
    console.log(`[audio] Transcrição de ${phone}: "${texto}"`);
    if (!texto) {
      await sendText(phone, '❌ Não consegui entender o áudio. Pode repetir ou mandar por texto?');
      return;
    }
    await processarMensagem(phone, texto);
  } catch (err) {
    console.error('[audio] Erro ao processar áudio:', err);
    await sendText(phone, '❌ Não consegui processar seu áudio. Pode tentar de novo ou descrever por texto?');
  }
}
