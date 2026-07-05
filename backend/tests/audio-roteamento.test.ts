import { describe, it, expect, vi, beforeEach } from 'vitest';

// audio.ts delega pro agente (roteamento completo) — aqui mockamos o agente
// inteiro e validamos so o encaminhamento: transcricao → processarMensagem.
const { transcState, processarMensagemSpy, sendTextSpy } = vi.hoisted(() => ({
  transcState: { text: 'comi 200g de frango' },
  processarMensagemSpy: vi.fn(async () => undefined),
  sendTextSpy: vi.fn(async () => undefined),
}));

vi.mock('groq-sdk', () => ({
  Groq: class {
    audio = { transcriptions: { create: vi.fn(async () => transcState.text) } };
  },
}));

vi.mock('groq-sdk/uploads', () => ({
  toFile: vi.fn(async () => ({})),
}));

vi.mock('../src/services/agent', () => ({
  processarMensagem: processarMensagemSpy,
}));

vi.mock('../src/services/evolution', () => ({
  sendText: sendTextSpy,
}));

import { processarAudio } from '../src/services/audio';

function stubDownload(ok = true): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({
      base64: Buffer.from('audio-fake').toString('base64'),
      mimetype: 'audio/ogg; codecs=opus',
    }),
  })));
}

beforeEach(() => {
  processarMensagemSpy.mockClear();
  sendTextSpy.mockClear();
  transcState.text = 'comi 200g de frango';
  stubDownload();
});

describe('processarAudio — audio passa pelo roteamento completo do agente', () => {
  it('transcricao valida → delega pro processarMensagem (entrevista/correcao/consulta funcionam por voz)', async () => {
    transcState.text = ' na verdade foram 150g de arroz ';

    await processarAudio('5562999999999', 'msg-audio-1');

    expect(processarMensagemSpy).toHaveBeenCalledWith('5562999999999', 'na verdade foram 150g de arroz');
    expect(sendTextSpy).not.toHaveBeenCalled();
  });

  it('transcricao vazia → avisa o paciente e NAO roteia', async () => {
    transcState.text = '   ';

    await processarAudio('5562999999999', 'msg-audio-2');

    expect(processarMensagemSpy).not.toHaveBeenCalled();
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toContain('Não consegui entender o áudio');
  });

  it('falha no download da midia → mensagem de erro amigavel, sem crash', async () => {
    stubDownload(false);

    await processarAudio('5562999999999', 'msg-audio-3');

    expect(processarMensagemSpy).not.toHaveBeenCalled();
    const msg = sendTextSpy.mock.calls[0][1] as string;
    expect(msg).toContain('Não consegui processar seu áudio');
  });
});
