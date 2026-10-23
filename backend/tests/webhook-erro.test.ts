import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Revisão 2026-10-23: qualquer erro no processamento (Claude fora, banco instável)
// caía no catch do webhook, que só fazia console.error — o paciente ficava sem
// resposta nenhuma e não sabia que precisava reenviar.

const { sendTextSpy, processarMensagemSpy } = vi.hoisted(() => ({
  sendTextSpy: vi.fn(async () => undefined),
  processarMensagemSpy: vi.fn(async () => undefined),
}));

vi.mock('../src/middleware/webhookAuth', () => ({
  requireWebhookAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../src/services/dedup', () => ({ marcarMensagemProcessada: async () => true }));
vi.mock('../src/services/queue', () => ({
  enfileirarPorTelefone: async (_phone: string, fn: () => Promise<void>) => fn(),
}));
vi.mock('../src/services/evolution', () => ({ sendText: sendTextSpy }));
vi.mock('../src/services/agent', () => ({ processarMensagem: processarMensagemSpy }));
vi.mock('../src/services/audio', () => ({ processarAudio: vi.fn() }));
vi.mock('../src/services/vision', () => ({ processarImagem: vi.fn() }));

import { webhookRouter } from '../src/routes/webhook';

let server: Server;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/webhook', webhookRouter);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhook`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  sendTextSpy.mockClear();
  processarMensagemSpy.mockReset();
});

const payloadTexto = (texto: string, id = 'msg-1') => ({
  event: 'messages.upsert',
  instance: 'nutrichat',
  data: {
    key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id },
    message: { conversation: texto },
    messageType: 'conversation',
  },
});

async function enviar(body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
}

describe('webhook — falha no processamento', () => {
  it('avisa o paciente quando o processamento lança erro', async () => {
    processarMensagemSpy.mockRejectedValueOnce(new Error('Claude 500'));
    await enviar(payloadTexto('comi 200g de frango'));
    await vi.waitFor(() => expect(sendTextSpy).toHaveBeenCalledTimes(1));
    const [telefone, mensagem] = sendTextSpy.mock.calls[0] as unknown as [string, string];
    expect(telefone).toBe('5511999990000');
    expect(mensagem).toMatch(/de novo/i);
  });

  it('erro de sobrecarga (429) pede pra esperar mais', async () => {
    processarMensagemSpy.mockRejectedValueOnce(Object.assign(new Error('rate limit'), { status: 429 }));
    await enviar(payloadTexto('oi', 'msg-2'));
    await vi.waitFor(() => expect(sendTextSpy).toHaveBeenCalledTimes(1));
    expect(sendTextSpy.mock.calls[0][1]).toMatch(/1-2 minutos/);
  });

  it('se até o aviso falhar, não derruba nada (só loga)', async () => {
    processarMensagemSpy.mockRejectedValueOnce(new Error('falha'));
    sendTextSpy.mockRejectedValueOnce(new Error('Evolution fora'));
    await enviar(payloadTexto('oi', 'msg-3'));
    await vi.waitFor(() => expect(sendTextSpy).toHaveBeenCalledTimes(1));
  });

  it('processamento normal não manda aviso de erro', async () => {
    await enviar(payloadTexto('oi', 'msg-4'));
    await vi.waitFor(() => expect(processarMensagemSpy).toHaveBeenCalledTimes(1));
    expect(sendTextSpy).not.toHaveBeenCalled();
  });
});
