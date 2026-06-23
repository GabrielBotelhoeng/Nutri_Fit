// P2-8: serializacao por telefone do processamento do webhook.
//
// Problema: atualizarEstado em conversation.ts faz read-modify-write em
// entrevista_dados (JSONB). Se o paciente manda 2 mensagens em sequencia
// rapida, ambas leem a mesma versao, processam em paralelo, e a segunda
// escrita sobrescreve a primeira — etapa/dados corrompidos.
//
// Solucao: fila promise-chain por phone. Mensagens do mesmo paciente
// rodam em ordem; phones diferentes rodam em paralelo normalmente.
//
// Cleanup: quando uma task termina e nada novo foi enfileirado depois
// dela, a entrada some do Map — sem vazamento de memoria por paciente
// inativo.

const filas = new Map<string, Promise<unknown>>();

export async function enfileirarPorTelefone<T>(
  phone: string,
  task: () => Promise<T>,
): Promise<T> {
  const anterior = filas.get(phone) ?? Promise.resolve();
  // .catch isola: se a task anterior falhar, a proxima ainda roda.
  // A propria task ainda pode lancar — quem chamou enfileirarPorTelefone
  // recebe o rejeito da SUA task, nao da anterior.
  const proxima = anterior.catch(() => undefined).then(() => task());

  filas.set(phone, proxima);

  // Cleanup: quando esta task termina, se ainda for a ultima da fila
  // (ninguem enfileirou nada depois), tira do Map. Caso contrario,
  // deixa — o proximo na fila vai limpar quando for a vez dele.
  proxima
    .catch(() => undefined)
    .finally(() => {
      if (filas.get(phone) === proxima) filas.delete(phone);
    });

  return proxima;
}

// Exposto para testes (size do Map indica vazamento).
export function _tamanhoFilaInterna(): number {
  return filas.size;
}
