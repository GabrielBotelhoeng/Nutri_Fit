// globalSetup/teardown dos agentes de teste: cria a pasta da rodada e, no fim,
// junta os resultados num RELATORIO.md legível.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ResultadoCenario } from './lib/relatorio';

// Preço por milhão de tokens (US$), aproximado — só pra ordem de grandeza no relatório.
const PRECO = { entrada: 3, saida: 15 };

export function setup() {
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const pasta = resolve(__dirname, 'relatorios', carimbo);
  mkdirSync(pasta, { recursive: true });
  process.env.AGENTES_RODADA_DIR = pasta;
}

export function teardown() {
  const pasta = process.env.AGENTES_RODADA_DIR;
  if (!pasta) return;
  const resultados = readdirSync(pasta)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(pasta, f), 'utf-8')) as ResultadoCenario)
    .sort((a, b) => a.id.localeCompare(b.id));

  const linhas: string[] = [`# Relatório dos agentes de teste\n`, `Rodada: ${pasta.split(/[\\/]/).pop()}\n`];
  linhas.push('| Cenário | Checagens | Nota do juiz | Problemas (alta/média/baixa) |', '|---|---|---|---|');
  let tokensEntrada = 0;
  let tokensSaida = 0;
  for (const r of resultados) {
    const ok = r.checagens.filter((c) => c.ok).length;
    const p = r.veredito?.problemas ?? [];
    const conta = (g: string) => p.filter((x) => x.gravidade === g).length;
    linhas.push(
      `| ${r.titulo} | ${ok}/${r.checagens.length}${ok < r.checagens.length ? ' ❌' : ' ✅'} | ${r.veredito?.nota ?? '—'} | ${conta('alta')}/${conta('media')}/${conta('baixa')} |`,
    );
    tokensEntrada = Math.max(tokensEntrada, r.uso.entrada);
    tokensSaida = Math.max(tokensSaida, r.uso.saida);
  }
  const custo = (tokensEntrada * PRECO.entrada + tokensSaida * PRECO.saida) / 1e6;
  linhas.push(`\nCusto aproximado dos agentes de teste (persona + juiz, sem contar o próprio bot): US$ ${custo.toFixed(2)}\n`);

  for (const r of resultados) {
    linhas.push(`\n---\n\n## ${r.titulo}\n`);
    linhas.push('### Checagens no banco e nas respostas\n');
    for (const c of r.checagens) linhas.push(`- ${c.ok ? '✅' : '❌'} ${c.descricao}${c.detalhe ? ` — ${c.detalhe}` : ''}`);
    if (r.veredito) {
      linhas.push(`\n### Juiz (nota ${r.veredito.nota}/5)\n\n${r.veredito.resumo}\n`);
      for (const p of r.veredito.problemas) linhas.push(`- **${p.gravidade}** — ${p.descricao}\n  > ${p.trecho.replace(/\n/g, ' ')}`);
    }
    linhas.push('\n<details><summary>Conversa completa</summary>\n');
    for (const t of r.transcricao) linhas.push(`**${t.de === 'paciente' ? '🧑 Paciente' : '🤖 Bot'}:** ${t.texto.replace(/\n/g, '  \n')}\n`);
    linhas.push('</details>');
  }
  const arquivo = resolve(pasta, 'RELATORIO.md');
  writeFileSync(arquivo, linhas.join('\n'), 'utf-8');
  console.log(`\n📋 Relatório dos agentes de teste: ${arquivo}\n`);
}
