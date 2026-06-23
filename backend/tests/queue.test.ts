import { describe, it, expect, vi } from 'vitest';
import { enfileirarPorTelefone, _tamanhoFilaInterna } from '../src/services/queue';

// Helper: cria uma task que registra start/end em uma lista compartilhada
// e resolve apos `ms`. Permite verificar ordem de execucao.
function tarefaCronometrada(
  log: string[],
  rotulo: string,
  ms: number,
): () => Promise<string> {
  return async () => {
    log.push(`start:${rotulo}`);
    await new Promise((r) => setTimeout(r, ms));
    log.push(`end:${rotulo}`);
    return rotulo;
  };
}

describe('enfileirarPorTelefone — serializacao por phone (P2-8)', () => {
  it('tasks do MESMO phone rodam em ordem (start B so depois do end A)', async () => {
    const log: string[] = [];
    const phone = '5562999999991';

    const pA = enfileirarPorTelefone(phone, tarefaCronometrada(log, 'A', 30));
    const pB = enfileirarPorTelefone(phone, tarefaCronometrada(log, 'B', 10));

    const [rA, rB] = await Promise.all([pA, pB]);

    expect(rA).toBe('A');
    expect(rB).toBe('B');
    expect(log).toEqual(['start:A', 'end:A', 'start:B', 'end:B']);
  });

  it('tasks de phones DIFERENTES rodam em paralelo', async () => {
    const log: string[] = [];

    // A no phone 1 espera 30ms; B no phone 2 espera 10ms.
    // Se rodassem em serie, log seria [startA, endA, startB, endB].
    // Em paralelo, B comeca antes de A terminar.
    const pA = enfileirarPorTelefone('5562999999991', tarefaCronometrada(log, 'A', 30));
    const pB = enfileirarPorTelefone('5562999999992', tarefaCronometrada(log, 'B', 10));

    await Promise.all([pA, pB]);

    expect(log[0]).toBe('start:A');
    expect(log[1]).toBe('start:B'); // B comeca antes de A terminar
    expect(log).toContain('end:A');
    expect(log).toContain('end:B');
  });

  it('falha em task A NAO impede task B do mesmo phone de rodar', async () => {
    const phone = '5562999999993';
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const pA = enfileirarPorTelefone(phone, async () => {
      throw new Error('falha proposital de A');
    });
    const pB = enfileirarPorTelefone(phone, async () => 'B-ok');

    // A rejeita
    await expect(pA).rejects.toThrow('falha proposital de A');
    // B ainda completa normal
    await expect(pB).resolves.toBe('B-ok');

    erroSpy.mockRestore();
  });

  it('cleanup do Map: fila fica vazia depois que tudo termina', async () => {
    const phone = '5562999999994';

    await enfileirarPorTelefone(phone, async () => 'x');
    // O finally do cleanup roda apos a Promise resolver. Damos uma volta
    // de event loop pra garantir que o microtask de cleanup executou.
    await new Promise((r) => setImmediate(r));

    expect(_tamanhoFilaInterna()).toBe(0);
  });

  it('preserva o valor de retorno da task pro chamador', async () => {
    const phone = '5562999999995';
    const r = await enfileirarPorTelefone(phone, async () => ({ valor: 42 }));
    expect(r).toEqual({ valor: 42 });
  });

  it('terceira task espera as duas anteriores (ordem total)', async () => {
    const log: string[] = [];
    const phone = '5562999999996';

    const pA = enfileirarPorTelefone(phone, tarefaCronometrada(log, 'A', 20));
    const pB = enfileirarPorTelefone(phone, tarefaCronometrada(log, 'B', 5));
    const pC = enfileirarPorTelefone(phone, tarefaCronometrada(log, 'C', 5));

    await Promise.all([pA, pB, pC]);

    expect(log).toEqual([
      'start:A', 'end:A',
      'start:B', 'end:B',
      'start:C', 'end:C',
    ]);
  });
});
