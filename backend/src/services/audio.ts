import { Groq } from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';
import { env } from '../config/env';
import { processarMensagem } from './agent';
import { sendText } from './evolution';
import { redactPhone } from '../utils/redact';

const INSTANCE = 'nutrichat';
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

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

export async function transcreverAudio(buffer: Buffer, mimetype: string): Promise<string> {
  // WhatsApp envia "audio/ogg; codecs=opus" — Groq quer o mimetype limpo.
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

// Delega pro processarMensagem pra audio passar pelas mesmas camadas do texto
// (entrevista, intent, correcao, saldo, agua, RAG) em vez de virar registro direto.
export async function processarAudio(phone: string, messageId: string): Promise<void> {
  try {
    const { buffer, mimetype } = await downloadMedia(messageId);
    const texto = (await transcreverAudio(buffer, mimetype)).trim();
    console.log(`[audio] Transcrição de ${redactPhone(phone)} (${texto.length} chars)`);
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
