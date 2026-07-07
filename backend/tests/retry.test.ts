import { describe, it, expect, vi, beforeEach } from 'vitest';
import { comBackoff } from '../src/utils/retry';

// Usamos vi.useFakeTimers pra nao esperar de verdade o backoff. Nas transicoes
// de retry, o helper chama `await new Promise(r => setTimeout(r, delay+jitter))`
// — com fake timers, adiantamos o clock e a promise resolve na hora.

beforeEach(() => {
  vi.useFakeTimers();
});

async function avancarClock(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('comBackoff', () => {
  it('sucesso na primeira tentativa nao aciona retry', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const p = comBackoff(fn);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('429 → 429 → sucesso: retry ate resolver e retorna valor', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce('ok');
    const p = comBackoff(fn);
    // Avanca cada janela de retry (delay dobra a cada iteracao, mais jitter <= 500ms)
    await avancarClock(1500);
    await avancarClock(2500);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('529 (Anthropic overloaded) e re-tentavel', async () => {
    const fn = vi.fn().mockRejectedValueOnce({ status: 529 }).mockResolvedValueOnce('ok');
    const p = comBackoff(fn);
    await avancarClock(1500);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('503 e re-tentavel', async () => {
    const fn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce('ok');
    const p = comBackoff(fn);
    await avancarClock(1500);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ETIMEDOUT (timeout de rede) e re-tentavel', async () => {
    const fn = vi.fn().mockRejectedValueOnce({ code: 'ETIMEDOUT' }).mockResolvedValueOnce('ok');
    const p = comBackoff(fn);
    await avancarClock(1500);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('400 (bad request) NAO e re-tentavel: propaga o throw sem esperar', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400, message: 'bad json' });
    await expect(comBackoff(fn)).rejects.toEqual({ status: 400, message: 'bad json' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('401 (auth) NAO e re-tentavel: propaga sem retry', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 });
    await expect(comBackoff(fn)).rejects.toEqual({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('erro sem status/code NAO e re-tentavel', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ops'));
    await expect(comBackoff(fn)).rejects.toThrow('ops');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('429 persistente esgota maxTentativas e propaga', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 429 });
    const p = comBackoff(fn, { maxTentativas: 3 });
    const assertion = expect(p).rejects.toEqual({ status: 429 });
    await avancarClock(1500);
    await avancarClock(2500);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('status vindo em err.response.status (formato axios) tambem e detectado', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce('ok');
    const p = comBackoff(fn);
    await avancarClock(1500);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respeita opcao maxTentativas customizada', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 429 });
    const p = comBackoff(fn, { maxTentativas: 2, delayInicialMs: 100 });
    const assertion = expect(p).rejects.toEqual({ status: 429 });
    await avancarClock(700);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
