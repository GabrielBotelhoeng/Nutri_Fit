# NutriChat — Documento de Projeto

> Contexto completo para uso com Claude Code no terminal ou qualquer sessão nova.
> Cole este arquivo no início de toda sessão como contexto do projeto.

---

## Visão geral

Plataforma de assistente nutricional para **nutricionista individual** (não é SaaS).  
Composta por três partes: landing page, painel do nutricionista e agente no WhatsApp (Nutri Chat).

**Objetivo atual:** portfólio (LinkedIn + GitHub). Se aparecer interesse real de um nutricionista, o produto já estará pronto para venda.

---

## O que é o Nutri Chat

Agente de IA no WhatsApp que:
- Recebe boas-vindas automáticas assim que o nutricionista cadastra o paciente no painel
- Já conhece o nome do paciente e já leu a dieta completa em PDF antes do primeiro contato
- Faz entrevista inicial para coletar dados físicos, atividade, horário de treino e suplementos
- Calcula TMB, meta de hidratação diária e dose de suplementos (quando não definidos na dieta)
- Registra refeições por texto, áudio, foto do prato, tabela nutricional ou código de barras
- Estima porções por foto (2 ângulos: de cima + lateral) sempre sinalizando a limitação da estimativa
- Confirma alimentos identificados por foto antes de registrar — só afirma com 100% de certeza
- Sugere substituições de alimentos usando apenas itens que já estão na dieta prescrita
- Calcula e informa macros + kcal consumidos vs meta ao longo do dia
- Envia alertas personalizados de refeição, água e suplementos nos horários certos
- Avisa 3 dias antes da expiração do plano e bloqueia quando vence
- Gera relatório semanal completo todo domingo

---

## Stack definitivo

| Parte | Tecnologia | Motivo |
|-------|-----------|--------|
| Landing page | Next.js + Three.js | Celular 3D + performance |
| Backend / API | Node.js + Express | Integra bem com tudo |
| Banco de dados | Supabase (Postgres + Storage) | BD + storage PDF + pgvector gratuito |
| WhatsApp | Evolution API | Open source, melhor do mercado |
| Orquestração | N8N | Workflows visuais, fácil de iterar |
| IA principal | Claude API (Sonnet) | Contexto longo, visão, áudio |
| Transcrição de áudio | Whisper via Groq | Gratuito e rápido |
| RAG da dieta | LangChain + Supabase pgvector | PDF vira contexto do agente |
| Código de barras | Open Food Facts API | Gratuita, base enorme |
| Hospedagem landing | Vercel | Deploy automático, free tier |
| Hospedagem backend/N8N | Railway | Simples, barato, sem dor de VPS |

---

## Arquitetura geral

```
LANDING PAGE (Next.js — Vercel)
        │
        ▼
BACKEND / API (Node.js + Express — Railway)
Controle de pacientes, planos, expiração, autenticação
        │
   ┌────┴────┐
   │         │
SUPABASE    N8N (Railway)
Postgres    Orquestrador dos workflows
Storage     do agente
pgvector         │
            ┌────┴────────────┐
            │                 │
     Evolution API      Claude API
     (WhatsApp)         + Groq Whisper
                        + Open Food Facts
```

---

## Fluxo do Nutri Chat

```
Paciente manda mensagem no WhatsApp
              │
    Evolution API → Webhook → N8N
              │
     ┌────────┼────────────────┐
   Texto    Áudio           Imagem / Código de barras
     │        │                    │
     │    Groq Whisper        Claude Vision /
     │    transcreve          Open Food Facts API
     └────────┴────────────────┘
                   │
              Claude API
         (contexto: RAG da dieta
          + histórico do paciente
          + dados basais da entrevista)
                   │
              Resposta gerada
                   │
         Evolution API → WhatsApp
```

---

## Funcionalidades detalhadas

### Onboarding — primeiro contato (disparado automaticamente ao cadastro)

O agente manda a primeira mensagem assim que o nutricionista salva o paciente no painel. O nome já vem do cadastro — não precisa perguntar.

**Mensagem de boas-vindas automática:**
> "Olá, boa tarde [Nome]! 🥗 Me chamo Nutri Chat, seu novo assistente nutritivo do [nome do nutricionista]. Já recebi sua dieta e já li tudo com atenção! Para que eu possa te acompanhar da melhor forma, posso te fazer algumas perguntas rápidas? Vai ser rápido e vai me ajudar muito a te conhecer melhor e dar um suporte mais certeiro."

**Entrevista inicial (sequencial, uma pergunta por vez, tom leve e acolhedor):**

1. Qual é a sua idade?
2. Qual é o seu sexo? (masculino / feminino)
3. Qual é o seu peso atual? (em kg)
4. Qual é a sua altura? (em cm ou metros)
5. Você pratica alguma atividade física? Se sim, qual? (ex: musculação, crossfit, caminhada, corrida...)
   - Se musculação ou crossfit: quantas vezes por semana? Em qual horário costuma treinar?
   - Se caminhada ou outra: qual a frequência e horário?
6. Você faz uso de algum suplemento? (creatina, whey, pré-treino, outro...)
   - Se sim: o agente registra e calcula a dose recomendada por peso caso não esteja especificada na dieta
   - **Regra:** se a dieta já tiver doses definidas pelo nutricionista, o agente respeita e não altera nada

**Após a entrevista o agente:**
- Calcula a **TMB (Taxa Metabólica Basal)** com base em peso, altura, idade, sexo e nível de atividade
- Calcula a **meta de hidratação diária** por peso (35ml/kg) e sugere distribuição ao longo do dia
- Calcula dose de creatina se necessário (0,03g/kg de peso corporal)
- Apresenta um resumo ao paciente confirmando tudo que aprendeu e pergunta se pode ativar os alertas de refeição, água e suplementos

---

### Cálculo e sugestão de hidratação

O agente calcula a necessidade de água pelo peso e sugere uma distribuição personalizada ao longo do dia considerando os horários de treino. Exemplo:

> "Com seu peso de 86kg, você deve ingerir aproximadamente 3,0L de água por dia. Posso sugerir assim: 500ml ao acordar, 700ml durante a manhã, 800ml no treino e pós-treino, 600ml à tarde e 400ml à noite. O que acha?"

---

### Cálculo de macros e basal diário

A cada refeição registrada o agente atualiza o saldo do dia e informa:

> "☀️ Saldo do dia — Gabriel
> Meta: 2.400 kcal
> Consumido: 940 kcal
> Restante: 1.460 kcal
>
> Macros até agora:
> 🍚 Carboidratos: 76g
> 🥩 Proteína: 67g
> 🧈 Gordura: 28g"

---

### Registro de refeições — formas aceitas

- **Texto:** "comi 400g de arroz branco com frango grelhado" → agente calcula e registra
- **Áudio:** transcrição automática via Groq Whisper → mesmo fluxo do texto
- **Foto do prato:** Claude Vision analisa → **agente não afirma de primeira** → confirma o alimento com o usuário antes de registrar. Só afirma diretamente se tiver 100% de certeza
- **Foto do prato para estimar porção:** usuário manda foto de cima + foto lateral → agente faz estimativa visual e avisa a limitação:
  > "Pela foto consigo estimar, mas não com total precisão. Pelo que vejo: arroz ~140g, frango ~300g, feijão ~40g, salada ~20g. Está próximo da realidade?"
- **Código de barras:** foto → Open Food Facts API → nutrientes do produto
- **Tabela nutricional:** foto do rótulo inteiro → Claude Vision lê os valores e registra

---

### Sugestão de substituições

Se o usuário disser que não tem um alimento da dieta, o agente sugere uma alternativa com macros equivalentes — **mas somente de alimentos que já estão na dieta prescrita pelo nutricionista.** Não inventa substituições fora da dieta.

> "Sem problema! No lugar do frango grelhado você pode usar atum em lata (150g) ou ovos mexidos (3 unidades). Ambos estão na sua dieta e têm proteínas similares. Qual prefere?"

---

### Alertas agendados (cron jobs N8N)

Baseados nos horários da dieta e no horário de treino informado pelo paciente:

```
08:00 — Bom dia, Gabriel! ☀️ Hora do café da manhã. Já tomou seus 500ml de água?
12:00 — Boa tarde! 🍽️ Já almoçou? Pode me contar o que comeu pra eu registrar aqui.
16:00 — Lembrete de treino! 💪 Não esqueça de se hidratar bem antes de treinar.
20:00 — Hora do jantar. 🌙 Me conta o que vai comer!
21:30 — Antes de dormir: já bateu sua meta de água hoje?
```

---

### Relatório semanal (todo domingo)

- Total de kcal consumidos vs meta da semana
- Média diária de cada macro (carboidrato, proteína, gordura)
- Hidratação média diária
- Dias em que a meta foi atingida vs dias abaixo
- Mensagem de incentivo personalizada

---

### Expiração de plano

- Cron job diário verifica datas de expiração no Supabase
- 3 dias antes: agente avisa que o plano está próximo do vencimento
- No dia do vencimento: agente passa a responder apenas informando que o plano expirou e como renovar com o nutricionista

---

## Planos oferecidos (preços sugeridos)

| Plano | Preço/mês |
|-------|-----------|
| 1 mês | R$ 330 |
| 3 meses | R$ 222/mês |
| 6 meses | R$ 130/mês |
| 12 meses | R$ 89,90/mês |

---

## Painel do nutricionista

Interface simples (protegida por login) onde o nutricionista:
- Cadastra paciente: nome + número WhatsApp + plano + data de expiração
- Faz upload do PDF da dieta do paciente
- Ativa/desativa acesso manualmente se necessário
- Visualiza quais pacientes estão com plano ativo

**Comportamento automático ao cadastrar paciente:**
No momento em que o nutricionista salva o paciente e faz o upload da dieta, o sistema dispara automaticamente uma mensagem de boas-vindas no WhatsApp do paciente. O agente já sabe o nome do paciente (vindo do cadastro) e já leu o PDF da dieta. Não precisa perguntar o nome.

Exemplo de mensagem de boas-vindas:
> "Olá, boa tarde Gabriel! 🥗 Me chamo Nutri Chat, seu novo assistente nutritivo do seu nutricionista. Já recebi sua dieta e já li tudo por aqui! Para que eu possa te ajudar da melhor forma possível, posso fazer algumas perguntas rápidas para te conhecer melhor?"

**Auth:** Supabase Auth (login simples, sem cadastro público)

---

## Landing page — estrutura

1. **Hero:** celular 3D animado (Three.js) com simulação do Nutri Chat
2. **Como funciona:** explicação do agente com exemplos visuais
3. **Funcionalidades:** foto de prato, áudio, alertas, relatório semanal
4. **Depoimentos:** feedbacks de pacientes
5. **Planos:** cards com preços e CTA
6. **Rodapé:** contato, redes sociais do nutricionista

### Fluxo de contratação (Opção 1 — manual via WhatsApp)

Ao clicar em qualquer plano, o usuário é redirecionado para o WhatsApp do nutricionista com uma mensagem pré-preenchida:

> "Olá! Tenho interesse no plano de [X meses] do Nutri Chat. Pode me passar mais informações?"

A partir daí o nutricionista:
1. Negocia e combina o pagamento (Pix ou link)
2. Confirma o pagamento
3. Cadastra o paciente no painel manualmente
4. O sistema dispara automaticamente a mensagem de boas-vindas no WhatsApp do paciente

### Fluxo de renovação

- **3 dias antes do vencimento:** agente avisa o paciente no WhatsApp
- **Mensagem de aviso:** agente informa que o plano está próximo do fim e manda o link/contato do nutricionista para renovar
- **No vencimento:** agente bloqueia e responde apenas informando que o plano expirou e como renovar
- **Após renovação:** nutricionista atualiza a data de expiração no painel e o acesso é restaurado automaticamente

---

## Identidade visual — paleta de cores

Inspiração: natureza, saúde, organic, leveza. Foge do azul clínico típico de apps de saúde.

| Nome | Hex sugerido | Uso |
|------|-------------|-----|
| **Verde floresta** | `#2D5016` | Cor primária, CTAs principais, títulos em destaque |
| **Verde médio** | `#4A7C2F` | Hover states, bordas, ícones |
| **Verde claro** | `#7DB85A` | Destaques, badges, progress bars |
| **Verde menta** | `#C8E6C0` | Backgrounds de cards, seções alternadas |
| **Verde off-white** | `#F0F7EC` | Background principal da página |
| **Marrom terra** | `#6B3D1E` | Tipografia principal, contraste |
| **Marrom claro** | `#A0694A` | Elementos secundários, subtítulos |
| **Creme** | `#FAF4ED` | Background alternativo, seções escuras invertidas |
| **Branco** | `#FFFFFF` | Fundo de cards, formulários |

### Combinações recomendadas

- **Hero:** fundo `#F0F7EC` + título `#2D5016` + CTA `#4A7C2F`
- **Cards de planos:** fundo branco + borda `#C8E6C0` + preço em `#2D5016`
- **Seção escura (destaque):** fundo `#2D5016` + texto `#F0F7EC` + acento `#7DB85A`
- **Tipografia geral:** `#6B3D1E` para títulos, `#A0694A` para subtítulos

> O celular 3D do hero pode ter reflexos em verde menta com fundo off-white para criar profundidade sem peso.

---

## Time de agentes (AIOX)

### Instrução para o AIOX Master

> Ao receber este documento, o AIOX Master deve:
> 1. Ler toda a visão do projeto NutriChat
> 2. Repassar o contexto para o Arquiteto e todos os agentes do time
> 3. Solicitar que cada agente avalie sua área e sinalize melhorias, riscos ou alternativas
> 4. Consolidar o feedback e apresentar sugestões de alteração antes de iniciar o desenvolvimento

---

### Agentes essenciais (sempre ativos)

| Agente | Responsabilidade |
|--------|-----------------|
| **Arquiteto** | Decisões de estrutura, padrões, stack. Consultar antes de começar qualquer feature |
| **Backend** | Node.js, APIs, integrações, Supabase, autenticação |
| **Frontend** | Next.js, Three.js, Tailwind, landing page, painel |
| **N8N Master** | Sênior e especialista em N8N. Cria todos os workflows: agente do WhatsApp, alertas, RAG, cron jobs, relatório semanal e qualquer automação. Principal referência para tudo que envolve N8N |
| **Code Reviewer** | Revisa antes de commitar. Busca bugs, má prática, inconsistência |

### Agentes situacionais (chamar quando precisar)

| Agente | Quando usar |
|--------|------------|
| **QA / Tester** | Quando uma feature ficar pronta — tenta quebrar |
| **Security** | Autenticação, dados dos pacientes, expiração de planos |
| **Prompt Engineer** | Comportamento do Nutri Chat, personalidade, qualidade das respostas |
| **Suporte** | Agente de apoio geral — pesquisa documentação, resolve dúvidas pontuais, desbloqueia outros agentes quando travam em alguma integração ou erro específico |

---

## Roadmap de desenvolvimento

### Fase 0 — Ambiente & contas
- [ ] Assinar Claude Pro
- [ ] Instalar Claude Code no terminal do computador (CMD) — `npm install -g @anthropic-ai/claude-code`
- [ ] Criar conta na Anthropic Console e pegar API key separada
- [ ] Criar projeto no Supabase (habilitar pgvector)
- [ ] Subir N8N localmente

### Fase 1 — Núcleo do Nutri Chat
- [ ] Evolution API — conectar WhatsApp
- [ ] Primeiro workflow N8N: mensagem → Claude → resposta
- [ ] RAG da dieta: PDF → pgvector → Claude acessa
- [ ] Áudios: Groq Whisper → texto → Claude
- [ ] Visão: foto de comida + código de barras
- [ ] Entrevista inicial + cálculo de TMB
- [ ] Alertas agendados (cron jobs N8N)
- [ ] Relatório semanal automático

### Fase 2 — Painel do nutricionista
- [ ] Login com Supabase Auth
- [ ] Cadastro de pacientes + upload de PDF
- [ ] Controle de expiração de planos

### Fase 3 — Landing page
- [ ] Hero com celular 3D (Three.js)
- [ ] Seções: funcionalidades, planos, depoimentos
- [ ] Deploy na Vercel

### Fase 4 — Portfólio
- [ ] README completo no GitHub (PT + EN)
- [ ] Vídeo demo gravado
- [ ] Post no LinkedIn

---

## Sugestões de inovação para o Nutri Chat

- **Modo substitutos inteligentes:** "não tenho frango hoje" → agente sugere substituição com macros equivalentes da própria dieta do usuário
- **Evolução mensal:** ao final de cada mês o agente envia resumo de peso, kcal médio e hidratação ao longo do período
- **Modo mercado:** além de código de barras, o usuário pode mandar foto do rótulo nutricional inteiro para o agente fazer a leitura completa

---

## Repositórios de terceiros utilizados

| Repositório | Link | Finalidade | Fase |
|-------------|------|-----------|------|
| **claude-mem** | https://github.com/thedotmack/claude-mem | Persistência de contexto entre sessões do Claude — elimina a necessidade de colar o PROJETO.md manualmente toda vez | Fase 0 |
| **n8n-mcp** | https://github.com/czlonkowski/n8n-mcp | MCP que dá ao Claude acesso direto à documentação e API do N8N — cria, valida e gerencia workflows programaticamente | Fase 1 |
| **n8n-skills** | https://github.com/czlonkowski/n8n-skills | 7 skills complementares ao n8n-mcp que ensinam o Claude a construir workflows N8N de nível produção (expressões, padrões, validação, JS/Python) | Fase 1 |
| **obsidian-skills** | https://github.com/kepano/obsidian-skills | Segundo cérebro — base de conhecimento persistente do Claude, armazena decisões, aprendizados e contexto do projeto de forma estruturada | Fase 0 |
| **get-shit-done** | https://github.com/gsd-build/get-shit-done | Framework de produtividade para execução do projeto — foco em entregar sem travar | Fase 0 |
| **ui-ux-pro-max-skill** | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | Skill de design para o agente de frontend — evita o visual genérico de IA, gera interfaces com identidade visual real | Fase 3 |
| **Evolution API** | https://github.com/EvolutionAPI/evolution-api | Integração WhatsApp open source | Fase 1 |

---

## Observações importantes

- **API key separada do plano Pro:** o plano Claude Pro é para desenvolvimento (Claude Code no terminal). A API key da Anthropic Console é para o produto em si rodar. São cobranças separadas.
- **Se `ANTHROPIC_API_KEY` estiver no ambiente**, o Claude Code usa a API key ao invés do plano Pro. Cuidado com isso.
- **Custo estimado de API** para 30-50 pacientes ativos: ~$10-40/mês — viável para embutir no preço do plano.
- **Começa local**, migra para Railway quando for fazer deploy.
