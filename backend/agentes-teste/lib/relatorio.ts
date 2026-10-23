// Cada cenário grava um JSON em relatorios/<rodada>/; o teardown global junta tudo
// num RELATORIO.md. Pasta relatorios/ fica fora do git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Turno } from './conversa';
import type { Veredito } from './llm';
import { uso } from './llm';

export type Checagem = { descricao: string; ok: boolean; detalhe?: string };

export type ResultadoCenario = {
  id: string;
  titulo: string;
  checagens: Checagem[];
  veredito?: Veredito;
  transcricao: Turno[];
  banco?: unknown;
  uso: { entrada: number; saida: number; chamadas: number };
};

export function pastaRodada(): string {
  const pasta = process.env.AGENTES_RODADA_DIR;
  if (!pasta) throw new Error('AGENTES_RODADA_DIR ausente — rode via npm run agentes');
  mkdirSync(pasta, { recursive: true });
  return pasta;
}

export function salvarResultado(r: Omit<ResultadoCenario, 'uso'>) {
  const completo: ResultadoCenario = { ...r, uso: { ...uso } };
  writeFileSync(resolve(pastaRodada(), `${r.id}.json`), JSON.stringify(completo, null, 2), 'utf-8');
}

// Checagem determinística: registra e devolve o booleano (o cenário decide se falha o teste).
export function checar(lista: Checagem[], descricao: string, ok: boolean, detalhe?: string) {
  lista.push({ descricao, ok, detalhe });
  return ok;
}
