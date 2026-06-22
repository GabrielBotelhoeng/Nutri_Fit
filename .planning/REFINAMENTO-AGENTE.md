# NutriChat — Refinamento do Agente (correção de bugs + nova experiência de mensagens)

> Documento de execução para o Claude Code. Leia inteiro antes de tocar em qualquer arquivo.
> Objetivo: corrigir os bugs **visíveis e silenciosos** do agente e redesenhar as mensagens
> de registro para serem mais informativas e visuais. Meta de fundo: que este bot seja
> claramente melhor que os concorrentes — transparente, que confirma e corrige, e que faz o
> paciente **sentir progresso** a cada registro.

---

## 0. Contexto rápido

- Backend Node.js/Express/TypeScript em `/backend`. Fluxo: WhatsApp → Evolution API → `POST /api/webhook` → `agentService.processarMensagem` → Evolution (resposta).
- Estado da entrevista/refeições vive em `pacientes.entrevista_dados` (JSONB) no Supabase.
- IA: Claude Sonnet 4.6 (consulta/visão) + Haiku 4.5 (macros/explicação).
- **Não há testes automatizados** — só smoke scripts em `backend/scripts/`. Parte da entrega é cobrir os parsers e cálculos com testes.

## 1. Princípios (valem para tudo abaixo)

1. **Nunca assumir em silêncio.** Toda estimativa (porção, horário, macro) que o bot chutou tem que ficar *visível* pro paciente e ser corrigível.
2. **Confirmar e corrigir > re-registrar.** O paciente tem que conseguir ajustar a última refeição sem o bot duplicar nada.
3. **On-brand.** O bot nunca recomenda apps/ferramentas concorrentes nem faz promessa médica. A "dica" sempre usa o próprio NutriChat.
4. **Framing saudável.** Celebrar consistência e aderência ao plano prescrito, não restrição pura. Ao ultrapassar a meta, mensagem é gentil e orientadora — nunca culpa ou alarme. (Produto clínico, sob supervisão do nutricionista.)
5. **Não quebrar o que funciona.** Manter idempotência do RAG, o RPC `acumular_registro_diario` (somar, nunca sobrescrever) e o bloqueio em camadas de plano expirado.
6. **WhatsApp, não Markdown.** Negrito = `*um asterisco*`. Itálico = `_um underscore_`. Sem headers `#`. Emojis com moderação.

---

## 2. Bugs a corrigir

Cada bug tem: **sintoma → causa-raiz → onde → correção esperada → critério de aceite**.
Prioridade: **P0** quebra/distorce dado agora · **P1** impacto forte · **P2** robustez.

### [P0-1] Correção de refeição duplica o registro (double-count)

- **Sintoma:** paciente registra "comi 200g de frango com arroz" (450 kcal); depois corrige por áudio "foram 200g de frango + 100g de arroz + 100g de feijão + coca zero" (505 kcal). O bot cria um **segundo** registro e soma: saldo vai de 450 → 955 kcal. O frango é contado duas vezes (proteína salta 45g → 97g).
- **Causa-raiz:** não existe o conceito de *editar/substituir a última refeição*. Toda mensagem de comida vira `registrarRefeicao` novo. O detector de intenção (regex) não distingue "registrar" de "corrigir", e não há memória de qual foi o último registro.
- **Onde:** `backend/src/services/agent.ts` (`processarMensagem`, detecção `ehRegistro`), `backend/src/services/meal.ts` (`registrarRefeicao`, `acumular_registro_diario`).
- **Correção esperada:**
  1. Guardar a **última refeição registrada** do dia (id + macros + descrição) no estado do paciente (ex.: `entrevista_dados.ultima_refeicao`).
  2. Detectar intenção de correção (ver [P1-3]): frases como "na verdade", "foram", "esqueci de falar", "corrige", "era X g de...". Quando for correção da última refeição, **substituir** — subtrair os macros antigos do registro diário e somar os novos (ou usar uma função `corrigirUltimaRefeicao` que ajusta o delta), em vez de inserir novo.
  3. Refletir a substituição na tabela `refeicoes` (update da linha, não insert) e no `registros_diarios` (delta).
- **Critério de aceite:** no cenário do print, após a correção o saldo do dia mostra **505 kcal**, não 955. A proteína reflete só uma porção de frango.

### [P0-2] Suposição silenciosa de quantidade

- **Sintoma:** "comi 200g de frango com arroz" → o bot estima o arroz sozinho e registra sem avisar. Se o paciente não reparar, passa batido com erro fácil de 150–250 kcal.
- **Causa-raiz:** o prompt em `meal.ts` → `calcularMacrosComClaude` diz literalmente *"Se a quantidade não for especificada, assuma porção média"*. Ele é instruído a chutar em silêncio, e o card final só mostra o total — nunca o que foi assumido.
- **Onde:** `backend/src/services/meal.ts` (`calcularMacrosComClaude`, `formatarSaldoDia`, `registrarRefeicao`).
- **Correção esperada:**
  1. Mudar o output do Haiku para **estruturado por item**: `{ itens: [{ nome, quantidade_g, quantidade_informada: bool }], totais: {kcal, proteina_g, carbo_g, gordura_g} }`.
  2. Se **algum item material** (proteína/carbo principal, não tempero/bebida zero) tiver `quantidade_informada: false`, fazer **uma** pergunta curta antes de registrar: _"Quantas gramas de arroz, mais ou menos? Se não souber, eu estimo uma porção média 👍"_. Uma pergunta só — se vier resposta, recalcula; se o paciente disser "estima" / "não sei", segue com a média.
  3. **Sempre** mostrar no card a quantidade de cada item, marcando o que foi estimado: `🍚 Arroz branco — ~100g _(estimei)_`.
- **Critério de aceite:** registrar item sem grama → card mostra a quantidade estimada com o marcador "_(estimei)_", e (quando o item é material) o bot pergunta antes. Itens com grama informada nunca disparam pergunta.

### [P0-2b] Suposição silenciosa de modo de preparo (follow-up, fase posterior)

- **Sintoma:** "comi batata" → o Haiku assume "Batata cozida" sem perguntar. Mas batata frita tem ~310 kcal/100g vs ~80 kcal/100g da cozida (~4×). Mesma armadilha do P0-2, mas em outro eixo (preparo, não quantidade). Cobre também "frango" (grelhado/frito/empanado), "ovo" (cozido/frito/mexido com manteiga), "peixe" (grelhado/empanado), etc.
- **Status atual:** P0-2 cobre só quantidade. O preparo escolhido pelo Haiku **aparece visível** no card ("Batata cozida — ~150g _(estimei)_"), então o paciente pode corrigir via P0-1 ("na verdade era frita") e o sistema recalcula. Funciona, mas exige atenção.
- **Correção esperada (opção B do raciocínio em sessão 2026-06-22):** estender o output do `analisarRefeicaoComClaude` com `preparo_inferido: bool` por item. Quando `preparo_inferido: true` E o item estiver numa whitelist de "preparo muda muito kcal" (batata, frango, ovo, peixe, carne moída...), perguntar antes de registrar: _"A batata foi frita, cozida ou assada?"_. Mesmo fluxo do `refeicao_pendente` atual, com TTL 10 min.
- **Critério de aceite:** "comi batata" → bot pergunta o preparo antes do card; "comi batata frita" não dispara pergunta (preparo informado).
- **Quando fazer:** após coleta de dados reais de quantas vezes o paciente erra o preparo. Não bloqueia Seção 3 nem fase 3.

### [P1-3] Detecção de intenção por regex é frágil

- **Sintoma:** "bebi 300ml de suco" é registrado como **água**. "comi bem hoje, qual minha dieta?" cai em **registro de refeição**. Correções não são reconhecidas (ver P0-1).
- **Causa-raiz:** roteamento empilhando regex (`ehRegistro`, `ehSubstituicao`, `ehAguaMsg`) em `processarMensagem`.
- **Onde:** `backend/src/services/agent.ts`.
- **Correção esperada:** substituir o roteamento por uma **classificação de intenção estruturada** (uma chamada Haiku barata ou tool use) que devolva `{ intent: 'registrar' | 'corrigir' | 'agua' | 'consulta' | 'substituicao', ... }`. O regex pode ficar como atalho rápido (fast-path) para casos óbvios, mas a decisão final é do classificador. Inclua `corrigir` como intenção (necessária para P0-1).
- **Critério de aceite:** os dois exemplos do sintoma roteiam certo. "bebi 300ml de suco" não vira água; "qual minha dieta" não vira registro.

### [P1-4] Fator de atividade subestima quem treina muito

- **Sintoma:** paciente que faz musculação 5x/semana recebe fator 1.55 (moderado) em vez de 1.725 (muito ativo). TDEE ~11% abaixo do real → todas as metas saem baixas.
- **Causa-raiz:** `detectarFatorAtividade` junta *tipo* e *frequência* numa lista achatada com *first-match-wins*. "musculacao 5x" bate em "musculacao" (1.55) antes de chegar em "5x" (1.725).
- **Onde:** `backend/src/services/calculos.ts` (`detectarFatorAtividade`, `FATORES_ATIVIDADE`).
- **Correção esperada:** separar em **dois eixos** — tipo de atividade e frequência semanal — e combinar (ex.: frequência domina o fator base; sedentário continua 1.2). Extrair a frequência numérica ("5x", "5 vezes", "cinco") explicitamente.
- **Critério de aceite:** musculação 5x → 1.725; 3x → 1.55; caminhada 2x → 1.375; sedentário → 1.2.

### [P1-5] Mensagem recomenda app concorrente (MyFitnessPal)

- **Sintoma:** ao fim da entrevista, a explicação manda o paciente "mapear no MyFitnessPal ou similar".
- **Causa-raiz:** texto gerado livre pelo Haiku em `gerarExplicacaoPersonalizada` (o prompt pede "1 dica prática" sem trava de marca).
- **Onde:** `backend/src/services/calculos.ts` (`gerarExplicacaoPersonalizada`).
- **Correção esperada:** adicionar guardrail no prompt: _"Nunca recomende outros apps, sites ou ferramentas. A dica deve usar o próprio NutriChat (ex.: 'me manda foto do prato que eu calculo pra você')."_ Opcional: filtro pós-geração que barra nomes de concorrentes conhecidos. Estender a mesma trava aos outros prompts de geração livre (sem promessa médica).
- **Critério de aceite:** nenhuma resposta gerada cita app/ferramenta externa.

### [P1-6] Horários da refeição: ler da dieta antes de perguntar

- **Sintoma:** a entrevista sempre pergunta os horários (etapa 14), mesmo quando a dieta em PDF já traz horários prescritos.
- **Causa-raiz:** o fluxo não consulta a dieta; só coleta da entrevista.
- **Onde:** `backend/src/services/rag.ts` (`processarDieta`), `backend/src/services/agent.ts` (etapa de horários, `PERGUNTAS_ENTREVISTA`, `parseHorariosRefeicoes`), `backend/src/routes/pacientes.ts` (ordem boas-vindas × processamento).
- **Correção esperada:**
  1. **Extração estruturada** (não RAG) no momento do upload: uma chamada Claude sobre o texto da dieta pedindo `{ cafe, lanche_manha, almoco, lanche_tarde, jantar }` com `null` onde o horário **não estiver explícito**. Salvar em `dietas.horarios_refeicoes` (nova coluna JSONB). Instruir o modelo a **não inferir** — só retornar horário escrito no PDF.
  2. **Timing:** garantir que a dieta seja processada **antes** da entrevista poder chegar na etapa de horários (hoje `enviarBoasVindas` roda antes de `processarDieta`, em background — corrigir a ordem ou bloquear a etapa até a extração concluir).
  3. **Branch na entrevista:** dieta com todos os horários → **confirmar e pular** ("Vi na sua dieta que suas refeições são 7h / 12h / 20h, confere?"); dieta **parcial** → perguntar só os horários faltantes; dieta **sem horários** → perguntar normalmente.
  4. **Sempre confirmar** os horários extraídos antes de gravar em `alertas_config`.
- **Critério de aceite:** dieta com horários → bot confirma e não faz a pergunta aberta. Dieta sem horários → pergunta como hoje. Dieta parcial → pergunta só o que falta. Nenhum horário inventado vai para `alertas_config`.

### [P2-7] Webhook sem idempotência (refeição dupla por reentrega)

- **Sintoma potencial:** a Evolution pode reentregar o mesmo evento → mesma refeição registrada duas vezes.
- **Onde:** `backend/src/routes/webhook.ts` (`data.key.id` disponível e hoje ignorado para dedup).
- **Correção esperada:** tabela `mensagens_processadas(message_id text primary key, processed_at timestamptz)`. No topo do handler, ignorar se o `message_id` já existe; senão registrar e processar.
- **Critério de aceite:** reenviar o mesmo payload duas vezes resulta em um único registro.

### [P2-8] Condição de corrida no estado da entrevista

- **Sintoma potencial:** paciente manda 2–3 mensagens em sequência rápida; `atualizarEstado` faz read-modify-write no JSONB e uma chamada sobrescreve a outra → etapa/dados corrompidos.
- **Onde:** `backend/src/services/conversation.ts` (`atualizarEstado`).
- **Correção esperada:** serializar o processamento **por telefone** (fila simples em memória por `phone`, ou lock). Mensagens do mesmo paciente processadas uma de cada vez, em ordem.
- **Critério de aceite:** disparar 3 respostas de etapa quase simultâneas não pula nem corrompe etapas.

### [P2-9] Sem memória de conversa

- **Sintoma:** o agente é single-turn; follow-ups ("e no jantar?", "e se eu trocar?") perdem contexto.
- **Onde:** `backend/src/services/agent.ts` (`responderComClaude`) e `meal.ts`.
- **Correção esperada:** manter as últimas N trocas (ex.: 6) por paciente e injetar no `messages` da consulta. Isso também sustenta a detecção de "corrigir" (P0-1) e o roteamento de intenção (P1-3).
- **Critério de aceite:** uma pergunta de follow-up usa o contexto da anterior sem o paciente repetir tudo.

---

## 3. Nova experiência de mensagens (registro de refeição)

Esta é a parte de produto: o paciente tem que **ler e sentir que está conquistando algo** a cada registro. Hoje o card mostra só total + saldo cru. Redesenhar.

### Princípios visuais
- Mostrar **o que foi comido por item** (com quantidade, marcando estimativas).
- Mostrar **o impacto da refeição isolada** ("essa refeição: …").
- Mostrar **progresso do dia com barras de texto** por macro e energia.
- Fechar com **micro-mensagem de progresso** — gentil, motivadora, adaptada ao quanto falta.
- Tom de conquista, não de vigilância. Ao ultrapassar a meta: orientar, nunca culpar.

### Barras de progresso (texto, WhatsApp)
Usar 10 blocos. Cheios `▰`, vazios `▱`. Função utilitária `barraProgresso(atual, meta, blocos=10)` que satura em 100% (não estoura visualmente) e cuida de divisão por zero.

### Formato-alvo do card (referência, não copiar literal — adaptar dados reais)

```
✅ *Registrado!*

🍗 Frango grelhado — 200g
🍚 Arroz branco — ~100g _(estimei)_

_Essa refeição:_ 450 kcal · 45g P · 45g C · 6g G

📊 *Seu dia até agora*
🔥 Energia    ▰▰▱▱▱▱▱▱▱▱  955 / 2384 kcal
🍗 Proteína   ▰▰▰▰▰▱▱▱▱▱  97 / 180 g
🍚 Carbo      ▰▰▰▱▱▱▱▱▱▱  88 / 268 g
🥑 Gordura    ▰▰▱▱▱▱▱▱▱▱  12 / 66 g

💪 Faltam *1.429 kcal* e *83g de proteína* pra fechar o dia. Tá indo bem!
```

### Regras da micro-mensagem final
- **Abaixo da meta (normal):** incentivo + o que falta de mais relevante (ex.: proteína).
- **Perto de bater (>85%):** comemorar a reta final.
- **Bateu a meta:** celebração ("🎯 Meta de proteína batida hoje!").
- **Ultrapassou:** gentil e orientador ("Você passou um pouco da meta de energia hoje — sem problema, amanhã equilibra. Quer dicas de ajuste?"). **Nunca** culpa, alarme ou linguagem de punição.

### Onde mexer
- `backend/src/services/meal.ts` → `formatarSaldoDia` (redesenho do card + barras), e a mensagem de confirmação de registro.
- Garantir que o mesmo card novo seja usado pelos fluxos de **texto, áudio e foto** (não duplicar formatação).

### Ideia opcional (validar depois): sequências/streaks
Contar dias consecutivos batendo metas-chave e celebrar ("🔥 3º dia seguido batendo a proteína!"). Manter **sempre** o framing saudável do item 4 dos princípios — celebrar consistência e aderência ao plano, nunca restrição. Implementar só depois dos P0/P1.

---

## 4. Segurança (track separado — pode ser outro PR)

Não bloqueia os bugs do agente, mas é pré-requisito para qualquer demo pública.

- **[SEC-1] `VITE_PANEL_API_KEY` exposta no bundle.** O Vite inlina `import.meta.env.VITE_*` no JS do navegador → a chave que protege o backend fica pública. Trocar `requirePanelKey` por validação do **JWT do Supabase Auth** (o painel já loga via Supabase): frontend manda `Authorization: Bearer <access_token>`; backend valida com `supabase.auth.getUser(token)`. Remover `VITE_PANEL_API_KEY`. Arquivos: `backend/src/routes/pacientes.ts`, `nutrichat-painel/src/pages/Dashboard.tsx`, `nutrichat-painel/src/components/PacienteModal.tsx`.
- **[SEC-2] Webhook sem autenticação.** Qualquer POST forjado pode se passar por qualquer telefone. Validar um secret/token da Evolution no `webhook.ts`.
- **[SEC-3] RLS `USING(true)` para `authenticated`.** Single-tenant, risco baixo, mas fechar antes de demo pública.

---

## 5. Testes (parte da entrega)

Adicionar Vitest e cobrir o que é puro e determinístico — hoje não há nada disso:
- Parsers da entrevista (`parseAltura`, `parsePeso`, `parseObjetivo`, `parseHorariosRefeicoes`, `parseRotinaHorarios`).
- `detectarFatorAtividade` (casos do critério de aceite do P1-4).
- `calcularTMB`, `calcularMacros`, `calcularHidratacao`, `calcularCreatina`.
- `barraProgresso` (saturação em 100%, divisão por zero).
- Lógica de correção/substituição da última refeição (P0-1) com o cenário do print (450 → 505, não 955).

---

## 6. Ordem de execução sugerida

1. **P0-1** (double-count) e **P0-2** (suposição silenciosa) — maior distorção de dado agora.
2. **Nova experiência de mensagens** (seção 3) — depende de P0-2 (mostrar itens/estimativas).
3. **P1-3** (intenção) e **P1-6** (horários da dieta).
4. **P1-4** (fator atividade) e **P1-5** (MyFitnessPal) — rápidos.
5. **P2-7/8/9** (idempotência, corrida, memória).
6. **Track segurança** (seção 4) em PR separado.
7. Testes (seção 5) acompanhando cada item.

> Ao terminar cada bloco: rodar `npm run typecheck` no `/backend`, rodar os testes, e lembrar de `docker restart nutrichat_backend` antes de testar no WhatsApp real (o `tsx watch` não recarrega volume no Docker/Windows).
