import { Router, Request, Response } from 'express';
import { sendText } from '../services/evolution';
import * as agentService from '../services/agent';
import * as audioService from '../services/audio';
import * as visionService from '../services/vision';
import { marcarMensagemProcessada } from '../services/dedup';
import { enfileirarPorTelefone } from '../services/queue';
import { requireWebhookAuth } from '../middleware/webhookAuth';

export const webhookRouter = Router();
// SEC-2: middleware roda ANTES do handler — sem o header `X-Webhook-Secret`
// valido, devolve 401 e nunca toca em agent/audio/vision.
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

  // P2-8: serializar por telefone. Mensagens consecutivas do mesmo paciente
  // sao processadas em ordem; o read-modify-write em entrevista_dados nao
  // perde escrita concorrente. Telefones diferentes rodam em paralelo.
  enfileirarPorTelefone(phone, async () => {
    try {
      switch (messageType) {
        case 'conversation':
        case 'extendedTextMessage': {
          const text =
            (data.message.conversation as string) ||
            (data.message.extendedTextMessage as { text: string })?.text ||
            '';
          // Texto vazio (sticker/reacao mal classificada, payload truncado):
          // nao ha o que rotear — evita queimar chamada de Haiku no
          // classificador e "Nao entendi" sem contexto na entrevista.
          if (!text.trim()) {
            console.log(`[webhook] Texto vazio de ${phone} — ignorado`);
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
