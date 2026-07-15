// Backoff exponencial pra Claude/OpenAI. Re-tenta 429/529/503 e timeouts
// de rede (ETIMEDOUT, ECONNRESET, ECONNREFUSED). Callers so precisam
// tratar UX quando o backoff nao resolve.
export async function comBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxTentativas?: number; delayInicialMs?: number } = {},
): Promise<T> {
  const { maxTentativas = 3, delayInicialMs = 1000 } = opts;
  let delay = delayInicialMs;
  let ultimoErro: unknown;

  for (let i = 0; i < maxTentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimoErro = e;
      const err = e as { status?: number; response?: { status?: number }; code?: string };
      const status = err?.status ?? err?.response?.status;
      const code = err?.code;
      const reTentavel =
        status === 429 ||
        status === 529 ||
        status === 503 ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED';

      if (!reTentavel || i === maxTentativas - 1) throw e;

      // Jitter evita thundering herd em pico de requests simultaneos.
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay + jitter));
      delay *= 2;
    }
  }

  throw ultimoErro;
}
