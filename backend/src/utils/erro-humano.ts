// Mensagem amigável pro paciente quando algo falha no processamento.
const MSG_ERRO_HUMANA = '😅 Tá um pouco lento aqui do meu lado agora. Me manda de novo em uns 30s?';

// Overload/timeout pede espera maior — retry em 5s só bateria 429 de novo.
export function mensagemErroHumana(err: unknown): string {
  const e = err as { status?: number; response?: { status?: number }; code?: string };
  const status = e?.status ?? e?.response?.status;
  const code = e?.code;
  const sobrecarga =
    status === 429 ||
    status === 529 ||
    status === 503 ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED';
  if (sobrecarga) return '😅 Meu servidor tá cheio agora. Tenta em 1-2 minutos.';
  return MSG_ERRO_HUMANA;
}
