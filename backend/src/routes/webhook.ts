import { Router, Request, Response } from 'express';
import { sendText } from '../services/evolution';
import * as agentService from '../services/agent';
import * as audioService from '../services/audio';
import * as visionService from '../services/vision';
import { marcarMensagemProcessada } from '../services/dedup';

export const webhookRouter = Router();

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
  // Remove sufixo @s.whatsapp.net ou @g.us
  return remoteJid.replace(/@[^@]+$/, '');
}

webhookRouter.post('/', async (req: Request, res: Response) => {
  // Responder 200 imediatamente — N8N nao pode aguardar processamento
  res.status(200).json({ status: 'received' });

  const payload = req.body as EvolutionPayload;

  // Ignorar mensagens enviadas pelo proprio bot
  if (payload?.data?.key?.fromMe) return;
  // Ignorar eventos que nao sao mensagens (Evolution API v2 usa 'messages.upsert')
  if (payload?.event !== 'MESSAGES_UPSERT' && payload?.event !== 'messages.upsert') return;

  const { data } = payload;
  const phone = extractPhoneNumber(data.key.remoteJid);
  const messageType = data.messageType;
  const messageId = data.key?.id;

  // P2-7: dedup de reentregas da Evolution API. Sem isso, o mesmo evento
  // reprocessado duplicaria refeicoes.
  if (messageId) {
    const novo = await marcarMensagemProcessada(messageId);
    if (!novo) {
      console.log(`[webhook] Descartado (duplicado) message_id=${messageId} phone=${phone}`);
      return;
    }
  }

  console.log(`[webhook] Mensagem de ${phone} | tipo: ${messageType}`);

  try {
    switch (messageType) {
      case 'conversation':
      case 'extendedTextMessage': {
        const text =
          (data.message.conversation as string) ||
          (data.message.extendedTextMessage as { text: string })?.text ||
          '';
        await agentService.processarMensagem(phone, text);
        break;
      }
      case 'audioMessage': {
        const messageId = data.key.id;
        await audioService.processarAudio(phone, messageId);
        break;
      }
      case 'imageMessage': {
        const messageId = data.key.id;
        const caption = (data.message.imageMessage as { caption?: string })?.caption ?? '';
        await visionService.processarImagem(phone, messageId, caption);
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
