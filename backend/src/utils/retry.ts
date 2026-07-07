// Backoff exponencial pra chamadas a Claude/OpenAI que podem estourar 429/529/503.
// Motivacao: em picos (varios pacientes registrando refeicao ao mesmo tempo), a
// Anthropic devolve 529 (overloaded) e o registro falhava sem retry. O helper
// centraliza o retry pra os callers so precisarem se preocupar com a UX humana
// quando o backoff nao resolve.
//
// Status re-tentaveis: 429 (rate limit), 529 (overloaded, Anthropic), 503
// (service unavailable). Timeouts de rede vem como ETIMEDOUT/ECONNRESET (nao
// tem status HTTP) — tambem re-tentaveis.
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

      // Jitter (0-500ms) evita thundering herd quando o pico vem de varios
      // requests simultaneos.
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay + jitter));
      delay *= 2;
    }
  }

  // Inalcancavel pelo laco acima (throw dentro do if), mas TS pede return.
  throw ultimoErro;
}
