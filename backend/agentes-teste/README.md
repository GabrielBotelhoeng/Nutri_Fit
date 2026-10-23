# Agentes de teste

Conversas **reais** com o agente do NutriChat — Claude de verdade, banco de verdade —
conduzidas por pacientes simulados. Pegam o que a suíte unitária (`npm test`, com
Claude e banco simulados) não pega: frases naturais, persistência, RPCs, contas do dia.

Rodam contra um **Supabase local** (Docker). Uma trava em `setup.ts` aborta se a URL
não for `localhost`/`127.0.0.1` — paciente fictício nunca vai pra produção.

## Como rodar

```bash
# 1. Supabase local (na raiz do repo; precisa do Docker Desktop ligado)
npx supabase start -x realtime,edge-runtime,logflare,vector,imgproxy,supavisor

# 2. Gera backend/.env.test apontando pro Supabase local (só na 1ª vez ou se resetar)
cd backend && npm run agentes:env

# 3. Roda a rodada completa
npm run agentes
```

As chaves de IA (`CLAUDE_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`) vêm do `.env` da raiz.
Uma rodada completa custa ~US$ 1–3 de API (bot + persona + juiz).

Ao final sai um relatório em `agentes-teste/relatorios/<data>/RELATORIO.md` (fora do git),
com: checagens no banco, veredito do juiz por cenário e a conversa completa.

Pra parar o Supabase local: `npx supabase stop` (na raiz).

## Como funciona

| Peça | Papel |
|---|---|
| `lib/conversa.ts` | `PacienteTeste`: cria o paciente no banco local, chama `processarMensagem` e captura as respostas (o `sendText` da Evolution é interceptado). Apaga tudo no fim. |
| `lib/llm.ts` | **Persona** (Haiku) que escreve como um paciente real, e **juiz** (Sonnet) que avalia a conversa contra o banco. |
| `lib/cenario.ts` | Moldura de cada cenário: cria → conversa → julga → salva → apaga (sempre, mesmo com erro). |
| `cenarios/*.agente.ts` | Os cenários. Checagens determinísticas no banco + critérios para o juiz. |

## Cenários

| Arquivo | O que cobre |
|---|---|
| `01-registro` | Refeição com/sem quantidade, várias refeições numa mensagem, correção, "esqueci de adicionar" |
| `02-onboarding` | Entrevista de 14 etapas inteira, com 2 personas (informal; idoso com números por extenso) |
| `03-agua-saldo-perguntas` | Água ("foram X copos"), saldo do dia vs banco, pergunta sobre alimento, dúvida sem PDF |
| `04-seguranca` | Dose de anabolizante (inclusive insistindo), promessa de resultado |
| `05-persona-livre` | Uso livre sem roteiro — onde aparecem os bugs que ninguém pensou em testar |

Pra adicionar um cenário: copie um `it(...)` existente, mude o roteiro, as checagens e os
critérios do juiz. Quando um cenário achar bug, escreva também um teste unitário em
`tests/` reproduzindo-o antes de corrigir.
