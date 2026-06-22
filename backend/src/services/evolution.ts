import { env } from '../config/env';

const INSTANCE = 'nutrichat';

interface SendTextPayload {
  number: string;
  text: string;
}

export async function sendText(to: string, text: string): Promise<void> {
  const url = `${env.EVOLUTION_API_URL}/message/sendText/${INSTANCE}`;
  const payload: SendTextPayload = { number: to, text };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[evolution] Falha ao enviar mensagem para ${to}: ${response.status} ${body}`);
    // Nao lanca excecao — falha de envio nao deve derrubar o webhook handler
  }
}
