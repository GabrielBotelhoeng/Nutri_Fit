# Handoff — Próxima sessão Claude

**Última atualização:** 2026-07-05 (fim da sessão de streaks + P0-2b + auditoria)
**Estado do repo:** trabalho novo na branch `claude/nutrichat-streaks-feature-ongoxm` → **PR #1 aberto** (https://github.com/GabrielBotelhoeng/Nutri_Fit/pull/1), aguardando revisão/merge do usuário.

## ⚡ Status imediato (ler primeiro)

- **PR #1** (`claude/nutrichat-streaks-feature-ongoxm` → `main`): streaks + P0-2b + 5 correções da auditoria. 267 testes verdes, typecheck limpo. **Não mergeado ainda** — o usuário disse em 2026-07-05 que mexeria nisso "amanhã". Se já foi mergeado quando você ler isto, recomece a branch a partir de `origin/main`.
- **Landing page**: pronta na máquina LOCAL do usuário, ainda não subiu pro GitHub. Combinado: ele roda `git checkout -b feat/landing-page && git add nutrichat-landing && git commit && git push -u origin feat/landing-page`; aí o Claude abre o PR dela e atualiza o STATE.md da fase 6.
- **Pós-merge do PR #1, o usuário precisa fazer na máquina local**: `git pull` + `docker restart nutrichat_backend`, e rodar o UAT (lista na seção 3).
- **Fases GSD reais** (a tabela do CLAUDE.md está desatualizada): 1–5 completas; 6 (landing) feita localmente pendente de push; 7 (deploy Railway/Vercel) não iniciada — precisa de contas/credenciais do usuário.

## O que já está feito (em `origin/main`)

Todo o track de refinamentos do agente + segurança + hardening está mergeado. Os 14 commits abaixo já foram pushed (sessões de 2026-06-24 → 06-27):

| Commit | Escopo |
|--------|--------|
| `457c11c` | chore: limpar `PANEL_API_KEY` órfã (SEC-1 cleanup) |
| `e47d484` | fix: rotear pergunta de saldo do dia pra handler dedicado (bug UAT) |
| `22d2a72` | feat: hardening do fallback OpenAI 429 em embeddings (rag.ts) |
| `a9da553` | feat (SEC-3): drop policies `authenticated USING(true)` — fecha RLS aberta |
| `924cb79` | feat (SEC-2): autenticar webhook Evolution via `X-Webhook-Secret` |
| `3a9592d` | feat (SEC-1): autenticar painel via JWT do Supabase Auth |
| `98a588a` | feat (P2-9): memória de conversa multi-turn |
| `887179c` | feat (P2-8): serializar processamento do webhook por telefone |
| `35cb437` | feat (P2-7): dedup de eventos do webhook por message_id |
| `b330201` | feat (P1-6): extrair horários da dieta antes da entrevista |
| `e819a48` | feat (P0-3): flag de suplementos controlados (clembuterol etc.) |
| `28429d1` | fix (P1-5): remover recomendação MyFitnessPal do prompt |
| `3b6d963` | feat (P1-4): fator de atividade em 2 eixos |
| `8ed4a4d` | feat (P1-3 + 3.1): classificador de intenção via Haiku + água silenciosa |

**Testes:** 209 vitest verdes na última checagem (backend). `npm run typecheck` limpo.

## O que falta fazer

### 1. Streaks no card de progresso — ✅ IMPLEMENTADO (2026-07-05, branch `claude/nutrichat-streaks-feature-ongoxm`)

Código escrito conforme o design abaixo: `calcularStreak` + `linhaStreak` em `meal.ts`, os 4 formatadores aceitam `streak?` opcional, os 6 call sites chamam `await calcularStreak` antes de formatar. Testes em `backend/tests/streaks.test.ts` (18 novos, suite em 227 verdes, typecheck limpo). Pendente: UAT via WhatsApp real. Especificação original mantida abaixo por referência.

**Regras de produto (fechadas com o usuário):**
- Dimensões que contam streak: **proteína** e **kcal** (água quebra fácil demais).
- Tolerância proteína: `>= 0.95 * meta`.
- Tolerância kcal: zona `[0.95*meta, 1.10*meta]` (ultrapassar não conta como bater).
- Se hoje já bateu, hoje conta. Se hoje ainda não bateu, não quebra — pula hoje e olha de ontem pra trás.
- Gap `>= 1 dia` entre registros para o streak.
- Só exibir mensagem quando `streak >= 2` (1 dia não é "sequência").

**Arquivo principal:** `backend/src/services/meal.ts`

Adicionar:
```typescript
type StreakInfo = {
  proteina: number;
  kcal: number;
  batendo_hoje_proteina: boolean;
  batendo_hoje_kcal: boolean;
};

async function calcularStreak(
  pacienteId: string,
  metas: MacrosDiarios
): Promise<StreakInfo>
```

Query `registros_diarios` últimos 30 dias, ordem `data DESC`, calcula separadamente por dimensão.

Modificar os 4 formatadores para receber `streak?: StreakInfo` opcional:
- `microMensagemFinal(saldo, metas, streak?)` → quando `streak.proteina >= 2` ou `streak.kcal >= 2`, prepend `🔥 *N dias seguidos batendo a proteína!*` (pega a dimensão de streak mais alto; empate → proteína). Se `batendo_hoje=false`, sufixo `Vamos pro próximo?`.
- `formatarBlocoProgressoDia(saldo, metas, streak?)`
- `formatarSaldoDia(..., streak?)`
- `formatarCardRefeicao(..., streak?)`

**Call sites a atualizar (6, todos chamam `await calcularStreak` antes):**
- `backend/src/services/vision.ts:249, 256, 273` — `formatarSaldoDia` (foto/rótulo/código de barras)
- `backend/src/services/agent.ts:825` — `formatarSaldoDia` (texto curto via mealService)
- `backend/src/services/agent.ts:902` — `formatarBlocoProgressoDia` (handler da pergunta de saldo)
- `backend/src/services/meal.ts:517, 564` — `formatarCardRefeicao` (texto P0-2 inicial e follow-up)
- `backend/src/services/meal.ts:630` — `formatarSaldoDia` (correção P0-1)

> **Atenção:** os números de linha estão datados de 2026-06-27. Verificar com Grep antes de editar.

**Schema:** `registros_diarios` já existe em `supabase/migrations/20260422000001_create_schema.sql:40` com `UNIQUE (paciente_id, data)`. **Não** precisa de migration nova. RPC `acumular_registro_diario` grava `data` em UTC (`new Date().toISOString().slice(0,10)`) — manter consistente.

**Testes a criar em `backend/tests/streaks.test.ts`:**
- Sem registros → `0/0`.
- 3 dias seguidos bateu proteína e kcal, hoje sem registro → `3/3`, `batendo_hoje=false`.
- Hoje bateu + 2 dias anteriores bateram → `3/3`, `batendo_hoje=true`.
- Hoje em andamento (kcal=0), 2 anteriores bateram → `2/2`, `batendo_hoje=false`.
- Hoje ultrapassou (`kcal > 1.10*meta`) → quebra kcal mas não quebra proteína se ela bateu.
- Gap de 2 dias → `0/0`.
- Meta zerada → `0/0` (guard).

Mocar Supabase pelo mesmo padrão de `backend/tests/meal-correcao.test.ts`.

### 2. P0-2b — Preparo silencioso — ✅ IMPLEMENTADO (2026-07-05, branch `claude/nutrichat-streaks-feature-ongoxm`)

Implementado conforme `.planning/REFINAMENTO-AGENTE.md:57-62`:
- `analisarRefeicaoComClaude` agora emite `preparo_inferido: boolean` por item (campo opcional em `ItemRefeicao` — compatível com análises antigas persistidas em estado).
- Whitelist `PREPARO_CRITICO` em `meal.ts`: batata, frango, ovo, peixe, carne moída (regex com normalização de acento).
- `preparo_inferido=true` + whitelist → pergunta "🍳 Como foi o preparo de *X*?" antes de registrar, via `preparo_pendente` (mesmo shape/TTL 10 min da `refeicao_pendente`; intercept em `agent.ts` antes do de quantidade). A pergunta de preparo vem ANTES da de quantidade; após a resposta, o fluxo P0-2 (quantidade) continua normalmente. Preparo não é re-checado após a resposta (uma pergunta por refeição, sem loop).
- "não sei"/"estima" → segue com o preparo assumido e o card mantém `_(estimei)_` (marcador agora dispara também por `preparo_inferido` em item da whitelist, além de quantidade estimada).
- Testes em `backend/tests/preparo.test.ts` (19 novos; suite em 246 verdes). Pendente: UAT via WhatsApp real ("comi batata" → pergunta preparo; "comi batata frita" → não pergunta).

### 2b. Auditoria de bugs do agente — ✅ 5 correções (2026-07-05, mesma branch)

Auditoria completa do fluxo de mensagens + contagem de calorias. Corrigidos:

1. **Áudio bypassava o agente** (`audio.ts`): todo áudio ia direto pra `processarTextoRefeicao` — entrevista por voz sumia, correção por áudio **duplicava refeição** (P0-1 seguia vivo nesse fluxo), consulta/saldo/água por áudio ficavam sem resposta, e o bloqueio de plano expirado não valia pra áudio. Agora delega pro `processarMensagem` (roteamento completo). Guard pra transcrição vazia.
2. **Datas em UTC deslocavam refeições noturnas pro dia seguinte** (contagem de calorias): jantar depois das 21h (UTC-3) caía em `registros_diarios` do dia seguinte — saldo "virava" às 21h, streak/água/relatório idem. Novo `src/utils/datas.ts` (`hojeLocal()` com `TIMEZONE_PACIENTES`, default America/Sao_Paulo) aplicado em meal.ts, agent.ts, expiracao.ts, relatorio.ts. Documentado em `backend/.env.example`.
3. **`processarTextoRefeicao` re-derivava a intenção por regex** e derrubava mensagem válida em silêncio ("2 copos de leite" classificado como registrar não batia no regex interno → paciente sem resposta) ou desviava registro pra substituição ("comi arroz, não tenho certeza" batia em "não tenho"). Agora recebe `intentHint` do classificador; sem hint (fallback da correção) o comportamento antigo se mantém.
4. **Lembrete de vencimento repetia em TODA mensagem** dos 3 dias finais. Agora no máximo 1x/dia (`ultimo_aviso_expiracao` em `entrevista_dados`, helper puro `avisoVencimentoPendente`).
5. **Texto vazio no webhook** era roteado (queimava chamada de Haiku). Agora ignorado.

Testes: `datas.test.ts`, `aviso-vencimento.test.ts`, `roteamento-refeicao.test.ts`, `audio-roteamento.test.ts` (21 novos; suite em 267 verdes). `streaks.test.ts` alinhado ao fuso local.

### 3. UAT humano (pendente do usuário)

Validação via WhatsApp + painel real. Itens antigos:
- P1-4 (fator de atividade), P1-5 (sem MyFitnessPal), P1-6 (horários da dieta), P2-9 (memória multi-turn), SEC-1/2/3.
- Monitorar comportamento do fallback OpenAI 429 (commit `22d2a72`) em produção.

Itens novos do PR #1 (testar após merge + pull + `docker restart nutrichat_backend`):
- Streak: registrar refeição batendo proteína 2+ dias seguidos → linha 🔥 no card.
- Preparo: "comi batata" → bot pergunta o preparo antes do card; "comi batata frita" → não pergunta.
- Áudio agora passa pelo roteamento completo: mandar áudio de correção ("na verdade foram 150g"), áudio de consulta ("qual minha dieta?") e responder etapa de entrevista por voz.
- Timezone: registrar refeição depois das 21h e conferir que caiu no saldo do dia CERTO.
- Mensagens que antes sumiam: "2 copos de leite" (sem verbo) deve registrar e responder.

### 4. Bug encoding UTF-8 (bloqueado em repro)

`"Água"` chegava como `�\udc81gua` no DB. Investigado em 2026-06-24, nenhum decode latin-1 identificado. Padrão `\udc81` sugere lone surrogate UTF-16. **Reabrir quando o usuário der exemplo concreto** — sem repro, qualquer fix é chute.

## Como retomar

1. Checar o estado do **PR #1**: mergeado? → recomeçar a branch de `origin/main`. Aberto? → continuar nele.
2. `cd backend && npm run test:run` — baseline atual **267 verdes** (`npm run typecheck` limpo).
3. Se o usuário subiu a branch `feat/landing-page`: abrir PR dela, revisar, atualizar `.planning/STATE.md` (fase 6).
4. Próximo trabalho codável depois disso: fase 7 (deploy Railway/Vercel — precisa de credenciais do usuário) e o bug UTF-8 (seção 4, só com repro).
5. Docker/UAT rodam só na máquina local do usuário (sessões remotas não têm Docker). Após editar TS local: `docker restart nutrichat_backend`.

## Referências

- Plano-mestre do refinamento: `.planning/REFINAMENTO-AGENTE.md`
- Handoff antigo (obsoleto — relatório parrudo já entregue): `.planning/HANDOFF.json`
- Estado GSD: `.planning/STATE.md`
