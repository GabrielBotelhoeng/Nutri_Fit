// Moldura comum dos cenários: cria o paciente, roda a conversa, julga, salva o
// resultado e SEMPRE apaga o paciente (finally) — nada fica sobrando no banco.
import { expect } from 'vitest';
import { PacienteTeste } from './conversa';
import { julgar } from './llm';
import { checar, salvarResultado, type Checagem } from './relatorio';

type Contexto = {
  paciente: PacienteTeste;
  checar: (descricao: string, ok: boolean, detalhe?: string) => boolean;
};

export async function rodarCenario(opcoes: {
  id: string;
  titulo: string;
  nome?: string;
  entrevistaConcluida?: boolean;
  dados?: Record<string, unknown>;
  // Critérios extras que o juiz deve olhar neste cenário. Sem isso, não chama o juiz.
  criteriosJuiz?: string;
  roteiro: (ctx: Contexto) => Promise<void>;
}) {
  const paciente = await new PacienteTeste(opcoes.nome ?? 'Paciente Teste', {
    entrevistaConcluida: opcoes.entrevistaConcluida,
    dados: opcoes.dados,
  }).criar();
  const checagens: Checagem[] = [];
  let erro: unknown;
  try {
    await opcoes.roteiro({ paciente, checar: (d, ok, det) => checar(checagens, d, ok, det) });
  } catch (e) {
    erro = e;
    checar(checagens, 'Conversa terminou sem exceção', false, String(e));
  }

  const banco = {
    estado: await paciente.estado(),
    refeicoes: await paciente.refeicoes(),
    saldo_hoje: await paciente.saldoHoje(),
  };
  const veredito = opcoes.criteriosJuiz
    ? await julgar(opcoes.titulo, opcoes.criteriosJuiz, paciente.transcricao, banco)
    : undefined;

  salvarResultado({
    id: opcoes.id,
    titulo: opcoes.titulo,
    checagens,
    veredito,
    transcricao: paciente.transcricao,
    banco,
  });
  await paciente.apagar();

  if (erro) throw erro;
  const falhas = checagens.filter((c) => !c.ok);
  expect(falhas, falhas.map((f) => `${f.descricao}${f.detalhe ? ` (${f.detalhe})` : ''}`).join('\n')).toEqual([]);
}

export const contem = (respostas: string[], re: RegExp) => respostas.some((r) => re.test(r));
export const tudo = (respostas: string[]) => respostas.join('\n');
