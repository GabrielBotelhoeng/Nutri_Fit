import { Router, Request, Response } from 'express';
import { sendText } from '../services/evolution';
import * as agentService from '../services/agent';
import * as audioService from '../services/audio';
import * as visionService from '../services/vision';
import { marcarMensagemProcessada } from '../services/dedup';
import { enfileirarPorTelefone } from '../services/queue';
import { requireWebhookAuth } from '../middleware/webhookAuth';
import { redactPhone } from '../utils/redact';

export const webhookRouter = Router();
// Auth roda ANTES do handler — sem header valido, 401 antes de tocar agent/audio/vision.
webhookRouter.use(requireWebhookAuth);

interface EvolutionPayload {
  event: string;
  instance: string;
  data: {
    key: { remoteJid: string; fromMe: boolean; id: string };
    message: Record<string, unknown>;
    messageType: string;
    pushName?: string;
  };
}

function extractPhoneNumber(remoteJid: string): string {
  return remoteJid.replace(/@[^@]+$/, '');
}

webhookRouter.post('/', async (req: Request, res: Response) => {
  // Ack imediato — Evolution API nao pode aguardar processamento.
  res.status(200).json({ status: 'received' });

  const payload = req.body as EvolutionPayload;

  if (payload?.data?.key?.fromMe) return;
  // Evolution API v2 usa 'messages.upsert' (lowercase); v1 usava 'MESSAGES_UPSERT'.
  if (payload?.event !== 'MESSAGES_UPSERT' && payload?.event !== 'messages.upsert') return;

  const { data } = payload;
  const phone = extractPhoneNumber(data.key.remoteJid);
  const messageType = data.messageType;
  const messageId = data.key?.id;

  // Diagnostico: separa "handler nao rodou" de "rodou mas parou entre dedup e enfileirar".
  // Remover apos concluir debug do webhook Evolution v2.
  console.log(`[webhook] recebido msgId=${messageId} event=${payload.event} phone=${redactPhone(phone)} tipo=${messageType}`);

  // Dedup de reentregas: mesmo evento reprocessado duplicaria refeicoes.
  if (messageId) {
    const novo = await marcarMensagemProcessada(messageId);
    if (!novo) {
      console.log(`[webhook] Descartado (duplicado) message_id=${messageId} phone=${redactPhone(phone)}`);
      return;
    }
  }

  console.log(`[webhook] Mensagem de ${redactPhone(phone)} | tipo: ${messageType}`);

  // Serializa por telefone: read-modify-write em entrevista_dados nao perde
  // escrita concorrente. Telefones diferentes rodam em paralelo.
  enfileirarPorTelefone(phone, async () => {
    try {
      switch (messageType) {
        case 'conversation':
        case 'extendedTextMessage': {
          const text =
            (data.message.conversation as string) ||
            (data.message.extendedTextMessage as { text: string })?.text ||
            '';
          // Sticker/reacao mal classificada, payload truncado.
          if (!text.trim()) {
            console.log(`[webhook] Texto vazio de ${redactPhone(phone)} — ignorado`);
            break;
          }
          await agentService.processarMensagem(phone, text);
          break;
        }
        case 'audioMessage': {
          const audioMessageId = data.key.id;
          await audioService.processarAudio(phone, audioMessageId);
          break;
        }
        case 'imageMessage': {
          const imageMessageId = data.key.id;
          const caption = (data.message.imageMessage as { caption?: string })?.caption ?? '';
          await visionService.processarImagem(phone, imageMessageId, caption);
          break;
        }
        default: {
          console.log(`[webhook] Tipo nao suportado: ${messageType}`);
        }
      }
    } catch (err) {
      console.error('[webhook] Erro ao processar mensagem:', err);
    }
  });
});
