// Serializa processamento do webhook por telefone.
//
// Problema: atualizarEstado faz read-modify-write em entrevista_dados
// (JSONB). Mensagens em rajada do mesmo paciente rodariam em paralelo
// e a segunda escrita sobrescreveria a primeira.
//
// Solucao: fila promise-chain por phone. Mesmo paciente = ordem
// estrita; phones diferentes = paralelo. Entrada some do Map quando
// a ultima task termina — sem vazamento por paciente inativo.

const filas = new Map<string, Promise<unknown>>();

export async function enfileirarPorTelefone<T>(
  phone: string,
  task: () => Promise<T>,
): Promise<T> {
  const anterior = filas.get(phone) ?? Promise.resolve();
  // .catch isola falha da anterior; a atual ainda pode rejeitar pra quem chamou.
  const proxima = anterior.catch(() => undefined).then(() => task());

  filas.set(phone, proxima);

  proxima
    .catch(() => undefined)
    .finally(() => {
      if (filas.get(phone) === proxima) filas.delete(phone);
    });

  return proxima;
}

// Exposto para testes (size do Map indica vazamento por paciente inativo).
export function _tamanhoFilaInterna(): number {
  return filas.size;
}
