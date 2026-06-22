# Phase 3: Registro de Refeições Multimodal — Research

**Researched:** 2026-04-24
**Domain:** Multimodal input processing — Groq Whisper (áudio), Claude Vision (imagem), Open Food Facts (código de barras), persistência Supabase
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Claude estima macros diretamente — sem APIs de tabela nutricional (TACO etc.). Precisão de 5-15% é aceitável.
- **D-02:** Alimento incerto → registra com aviso (`⚠️ Estimativa para [alimento] — confirme com seu nutricionista`), sem bloquear o fluxo.
- **D-03:** Claude Vision detecta automaticamente o tipo de foto (prato / código de barras / rótulo). Paciente não digita o tipo.
- **D-04:** Após 1ª foto do prato, bot solicita 2ª foto (ângulo lateral). Se não chegar, processa com 1ª + aviso.
- **D-05:** Estado das 2 fotos gerenciado em `entrevista_dados` JSONB. Timeout de 5 minutos. Reutiliza `getEstado`/`atualizarEstado`.
- **D-06:** Agente confirma alimentos identificados antes de registrar (pede sim/não). Nunca afirma sem certeza.
- **D-07:** Saldo exibido após cada registro — formato: ✅ Registrado + 📊 Saldo do dia com kcal e macros vs meta.
- **D-08:** Meta de kcal = `tdee_kcal` de `entrevista_dados`. Distribuição: 30% proteína, 40% carbo, 30% gordura.
- **D-09:** Substituições apenas da dieta prescrita via `rag.ts query()`.

### Claude's Discretion

- Prompt exato para Claude Vision identificar alimentos e estimar macros
- Estratégia de retry se Open Food Facts não encontrar o código de barras
- Formato interno do estado temporário das 2 fotos em `entrevista_dados`
- Threshold de confiança do Claude Vision para disparar aviso de incerteza

### Deferred Ideas (OUT OF SCOPE)

- Reconhecimento de alimentos por nome sem foto via imagem gerada
- Histórico de refeições consultável pelo paciente — Fase 4 ou v2
- Integração com balanças inteligentes — out of scope v1
- Sugestão automática de substituição sem o paciente pedir
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descrição | Research Support |
|----|-----------|-----------------|
| AGENT-02 | Áudio transcrito via Groq Whisper; tratado como texto | Seção Groq Whisper — `toFile` + buffer de URL download |
| AGENT-03 | Imagem de prato analisada pelo Claude Vision; confirmação antes de registrar | Seção Claude Vision — content block `image/base64` |
| AGENT-04 | 2 ângulos geram estimativa de porção com aviso de limitação | Seção Fluxo 2-fotos — estado JSONB + timeout |
| AGENT-05 | Código de barras → nutrientes via Open Food Facts API | Seção Open Food Facts — endpoint + campos `*_100g` |
| AGENT-06 | Foto de rótulo lida pelo Claude Vision; valores registrados | Seção Claude Vision — mesmo fluxo de imagem com prompt específico |
| AGENT-13 | Paciente registra refeição por texto; agente calcula macros e registra | Seção Registro por Texto — prompt Claude + INSERT `refeicoes` + UPSERT `registros_diarios` |
| AGENT-14 | Registro por áudio; após transcrição, mesmo fluxo do texto | AGENT-02 → AGENT-13 em pipeline |
| AGENT-15 | Saldo do dia exibido após cada refeição | Seção Saldo Diário — SELECT `registros_diarios` + cálculo metas |
| AGENT-16 | Substituições de alimentos apenas da dieta prescrita | `rag.query()` já existente — reutilizar diretamente |
</phase_requirements>

---

## Summary

Esta fase adiciona processamento multimodal ao backend NutriChat já funcional. O agente passou da Fase 2 a responder perguntas sobre a dieta via RAG; agora precisa registrar **o que o paciente comeu** a partir de qualquer mídia (texto, áudio, foto, código de barras, rótulo).

O stack de integração é simples: **Groq Whisper** para transcrever áudio (SDK `groq-sdk` já configurado no `env.ts`), **Claude Vision** para analisar imagens (mesmo `@anthropic-ai/sdk` já em uso no `agent.ts`), e **Open Food Facts** para buscar macros de produtos industrializados por código de barras (API pública REST, sem chave). O ponto de entrada são os dois stubs `audioMessage`/`imageMessage` em `webhook.ts` que precisam ser substituídos.

A principal complexidade arquitetural é o **estado inter-mensagem das 2 fotos** (D-04/D-05): a 1ª foto chega, o bot pede a 2ª, e a 2ª chega como mensagem separada 0–5 minutos depois. O campo `entrevista_dados` JSONB já existente resolve isso sem nova coluna ou tabela. O maior risco de implementação é baixar mídia do Evolution API v2.3.7: o endpoint `/chat/getBase64FromMediaMessage/{instance}` retorna base64 dado o `message.key.id`, que está disponível no payload do webhook.

**Recomendação principal:** Estruturar 4 novos arquivos de serviço (um por domínio: `audio.ts`, `vision.ts`, `barcode.ts`, `meal.ts`) que `agent.ts` orquestra, mantendo cada serviço testável isoladamente.

---

## Architectural Responsibility Map

| Capacidade | Tier Primário | Tier Secundário | Racional |
|------------|--------------|-----------------|----------|
| Receber webhook de áudio/imagem | Backend — `webhook.ts` | — | Entry point já existente, stubs a substituir |
| Download de mídia do Evolution API | Backend — `services/audio.ts` | — | Chamada HTTP para API local; não é responsabilidade do webhook |
| Transcrição de áudio | Backend — `services/audio.ts` | Groq Cloud | CPU-intensivo delegado ao Groq |
| Análise de imagem (Vision) | Backend — `services/vision.ts` | Claude API | Requer base64 + prompt — isolado do webhook |
| Detecção de tipo de imagem | Backend — `services/vision.ts` | — | Uma chamada Claude Vision com prompt de classificação |
| Estimativa de macros por texto | Backend — `services/meal.ts` | Claude API | Prompt estruturado com output JSON |
| Busca de produto por barcode | Backend — `services/barcode.ts` | Open Food Facts | REST público sem auth |
| Persistência de refeição | Backend — `services/meal.ts` | Supabase | INSERT `refeicoes` + UPSERT `registros_diarios` |
| Cálculo de metas do dia | Backend — `services/meal.ts` | Supabase | SELECT `registros_diarios` + dados `tdee_kcal` do paciente |
| Estado entre 2 fotos | Backend — `services/conversation.ts` | Supabase JSONB | Reutiliza `getEstado`/`atualizarEstado` existente |

---

## Standard Stack

### Core (já instalado)

| Library | Versão instalada | Propósito | Verificação |
|---------|-----------------|-----------|-------------|
| `@anthropic-ai/sdk` | `^0.36.3` (npm: 0.91.0 atual) | Claude Vision + estimativa de macros | [VERIFIED: npm registry — `npm view @anthropic-ai/sdk version`] |
| `@supabase/supabase-js` | `^2.39.3` | INSERT refeicoes + UPSERT registros_diarios | [VERIFIED: package.json] |
| `groq-sdk` | não instalado ainda (npm: 1.1.2, publicado 2026-03-25) | Transcrição Whisper | [VERIFIED: npm registry — `npm view groq-sdk version`] |

> **ATENÇÃO:** `@anthropic-ai/sdk` no `package.json` está como `^0.36.3`, mas a versão publicada no npm é `0.91.0`. O `^` deve resolver para a mais recente compatível. Confirmar com `docker exec nutrichat_backend npm ls @anthropic-ai/sdk` antes de usar features novas.

### A Instalar

| Library | Versão | Propósito | Por que padrão |
|---------|--------|-----------|----------------|
| `groq-sdk` | `^1.1.2` | Whisper transcription | SDK oficial Groq; suporte a `toFile()` e `url` parameter |

**Instalação:**
```bash
cd backend && npm install groq-sdk
```

Após instalar, rebuild do container:
```bash
docker-compose build backend && docker-compose up -d backend
```

### Sem Instalação Adicional

| Integração | Método | Motivo |
|-----------|--------|--------|
| Open Food Facts | `fetch()` nativo | API REST pública, sem SDK necessário, sem auth |
| Evolution API getBase64 | `fetch()` nativo | Chamada interna Docker na mesma rede |

---

## Architecture Patterns

### Diagrama de Fluxo — Mensagem de Áudio

```
WhatsApp
  │
  ▼
Evolution API (webhook MESSAGES_UPSERT)
  │  payload: { messageType: "audioMessage", data.message.audioMessage, data.key.id }
  ▼
webhook.ts — case "audioMessage"
  │  extrai: phone, messageId (data.key.id)
  ▼
audio.ts — downloadMedia(messageId) → Buffer
  │  POST /chat/getBase64FromMediaMessage/nutrichat → base64 → Buffer
  ▼
audio.ts — transcreverAudio(buffer, mimetype) → texto
  │  groq.audio.transcriptions.create({ file: toFile(buffer, ...), model: "whisper-large-v3-turbo", language: "pt" })
  ▼
meal.ts — processarTextoRefeicao(phone, texto)
  │  (mesmo fluxo do registro por texto — AGENT-13)
  ▼
Evolution API — sendText(phone, saldo)
```

### Diagrama de Fluxo — Mensagem de Imagem

```
WhatsApp
  │
  ▼
Evolution API (webhook MESSAGES_UPSERT)
  │  payload: { messageType: "imageMessage", data.key.id, data.message.imageMessage.caption? }
  ▼
webhook.ts — case "imageMessage"
  │  extrai: phone, messageId, caption
  ▼
vision.ts — downloadMedia(messageId) → base64String
  │  POST /chat/getBase64FromMediaMessage/nutrichat
  ▼
vision.ts — detectarTipoImagem(base64) → "prato" | "barcode" | "rotulo"
  │  claude.messages.create com image content block + prompt de classificação
  ▼
  ├─ "barcode" → barcode.ts — extrairCodigoBarras(base64) → buscarOpenFoodFacts(barcode)
  │               → meal.ts — registrarRefeicao(pacienteId, dados, "codigo_barras")
  │
  ├─ "rotulo"  → vision.ts — lerRotulo(base64) → macros JSON
  │               → meal.ts — registrarRefeicao(pacienteId, dados, "rotulo")
  │
  └─ "prato"   → verificar estado aguardando_foto_2?
                  │ SIM → vision.ts — analisarPrato([foto1, foto2]) → confirmação
                  │ NÃO → salvar foto1 em entrevista_dados, pedir foto lateral
                  ▼
                meal.ts — confirmarERegistrar(phone, analise)
                  │  sendText("Identifiquei: [X, Y, Z]. Correto? (sim/não)")
                  │  aguarda resposta → se sim, registra
                  ▼
                meal.ts — registrarRefeicao + exibirSaldoDia
```

### Estrutura de Arquivos Recomendada

```
backend/src/
├── services/
│   ├── agent.ts           # existente — orquestrar novos serviços
│   ├── audio.ts           # NOVO — downloadMedia() + transcreverAudio()
│   ├── vision.ts          # NOVO — detectarTipo() + analisarPrato() + lerRotulo()
│   ├── barcode.ts         # NOVO — buscarOpenFoodFacts()
│   ├── meal.ts            # NOVO — processarTextoRefeicao() + registrarRefeicao() + saldoDia()
│   ├── conversation.ts    # existente — reutilizar getEstado()/atualizarEstado()
│   ├── evolution.ts       # existente — reutilizar sendText()
│   └── rag.ts             # existente — reutilizar query() para substituições
├── routes/
│   └── webhook.ts         # existente — substituir stubs audioMessage/imageMessage
└── config/
    └── env.ts             # existente — GROQ_API_KEY já presente
```

### Pattern 1: Download de Mídia do Evolution API

```typescript
// Source: doc.evolution-api.com/v2/api-reference/chat-controller/get-base64
// e verificação via curl no container local (retorna 400 "Message not found" para ID inválido — endpoint funciona)
async function downloadMedia(messageId: string): Promise<Buffer> {
  const url = `${env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      message: { key: { id: messageId } },
      convertToMp4: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`[media] Falha ao baixar mídia ${messageId}: ${response.status}`);
  }

  const data = await response.json() as { base64: string; mimetype: string };
  return Buffer.from(data.base64, 'base64');
}
```

**Nota sobre o campo `base64` na resposta:** A documentação oficial não detalha o schema exato da resposta. Com base em análise de issues do GitHub (#942, #2091) e do comportamento do endpoint (confirmado localmente: retorna 400 para ID inválido, 200 para ID real), a resposta contém `{ base64: string, mimetype: string }`. [ASSUMED — estrutura exata da resposta não verificada com mensagem real; verificar no Wave 0 com uma mensagem de áudio/imagem real]

### Pattern 2: Transcrição com Groq Whisper

```typescript
// Source: console.groq.com/docs/speech-to-text (verificado via WebFetch)
import { Groq } from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

async function transcreverAudio(buffer: Buffer, mimetype: string): Promise<string> {
  // WhatsApp envia áudio como audio/ogg (OPUS) — suportado pelo Whisper
  const extension = mimetype.includes('ogg') ? 'ogg'
    : mimetype.includes('mp4') ? 'mp4'
    : mimetype.includes('webm') ? 'webm'
    : 'ogg'; // fallback padrão WhatsApp

  const audioFile = await toFile(buffer, `audio.${extension}`, { type: mimetype });

  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-large-v3-turbo',
    language: 'pt',  // Português — melhora precisão significativamente
    response_format: 'text',
    temperature: 0.0,
  });

  return transcription as unknown as string; // response_format: 'text' retorna string diretamente
}
```

**Limite:** 25 MB por arquivo. Áudios WhatsApp típicos ficam entre 10 KB e 2 MB — sem problema. [VERIFIED: console.groq.com/docs/speech-to-text]

### Pattern 3: Claude Vision — Content Block base64

```typescript
// Source: platform.claude.com/docs/claude/docs/vision (verificado via WebFetch)
async function analisarImagemComClaude(
  base64: string,
  mimetype: string, // "image/jpeg" | "image/png" | "image/webp" | "image/gif"
  prompt: string,
): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimetype as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: base64,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

**Tipos MIME suportados:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`. WhatsApp envia imagens normalmente como `image/jpeg`. [VERIFIED: platform.claude.com/docs/claude/docs/vision]

**Custo de tokens de imagem no Claude Sonnet 4.6:** ~1568 tokens para foto de smartphone (1920x1080), ≈ $0.0047/imagem. [VERIFIED: tabela de custos Anthropic]

### Pattern 4: Detecção de Tipo de Imagem

```typescript
// Claude's Discretion — prompt recomendado (não há standard estabelecido para este caso)
const PROMPT_DETECTAR_TIPO = `Analise esta imagem e responda APENAS com uma das três opções:
- "prato" — se for uma foto de comida, prato ou refeição
- "barcode" — se for uma foto de código de barras (código de barras EAN/QR)
- "rotulo" — se for uma foto de tabela nutricional ou rótulo de embalagem de alimento

Responda com APENAS uma palavra. Não explique.`;

// Após detecção, segundo prompt específico por tipo:
const PROMPT_ANALISAR_PRATO = `Você é um assistente nutricional. Analise esta foto de refeição.

TAREFA: Identifique os alimentos visíveis e estime os macronutrientes.

RESPONDA EM JSON com exatamente este formato:
{
  "alimentos": ["alimento 1 com quantidade estimada", "alimento 2 com quantidade estimada"],
  "confianca": "alta" | "media" | "baixa",
  "kcal": number,
  "proteina_g": number,
  "carbo_g": number,
  "gordura_g": number,
  "aviso": "string ou null"
}

Se a porção for incerta, estime o mais conservadoramente possível e coloque aviso.
Responda APENAS com JSON válido, sem markdown.`;

const PROMPT_LER_ROTULO = `Você é um assistente nutricional. Leia esta tabela nutricional de rótulo.

RESPONDA EM JSON com exatamente este formato:
{
  "produto": "nome do produto se visível",
  "porcao_g": number,
  "kcal_porcao": number,
  "proteina_g": number,
  "carbo_g": number,
  "gordura_g": number
}

Se algum campo não estiver visível, use null. Responda APENAS com JSON válido.`;
```

### Pattern 5: Open Food Facts

```typescript
// Source: openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/ (verificado via WebFetch)
interface OpenFoodFactsNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
}

interface OpenFoodFactsResponse {
  status: 0 | 1;
  status_verbose: string;
  product?: {
    product_name?: string;
    nutriments?: OpenFoodFactsNutriments;
  };
}

async function buscarOpenFoodFacts(barcode: string): Promise<{ nome: string; macrosPor100g: MacrosRefeicao } | null> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'NutriChat/1.0 (botelhog45@gmail.com)' }, // requerido por OFF
  });

  if (!response.ok) return null;

  const data = await response.json() as OpenFoodFactsResponse;

  if (data.status !== 1 || !data.product?.nutriments) {
    return null; // produto não encontrado
  }

  const n = data.product.nutriments;
  return {
    nome: data.product.product_name ?? `Produto ${barcode}`,
    macrosPor100g: {
      kcal: n['energy-kcal_100g'] ?? 0,
      proteina_g: n.proteins_100g ?? 0,
      carbo_g: n.carbohydrates_100g ?? 0,
      gordura_g: n.fat_100g ?? 0,
    },
  };
}
```

**Estratégia de fallback se barcode não encontrado** (Claude's Discretion): Claude Vision re-analisa a imagem como se fosse um rótulo (`PROMPT_LER_ROTULO`), extraindo macros diretamente. Se isso também falhar, registra com aviso D-02.

### Pattern 6: Estado Entre 2 Fotos

```typescript
// Formato interno em entrevista_dados (Claude's Discretion — recomendado)
interface EstadoAguardandoFoto2 {
  aguardando_foto_2: {
    foto1_message_id: string;   // key.id da 1ª foto para re-download se necessário
    foto1_base64: string;       // base64 da 1ª foto (já baixada)
    timestamp: string;          // ISO 8601 — para checar timeout de 5 min
  };
}

// Verificação de timeout
function estaNoTimeout(timestamp: string, minutos: number = 5): boolean {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  return diffMs <= minutos * 60 * 1000;
}

// Em webhook.ts case "imageMessage":
const estado = await getEstado(paciente.id);
const dadosRaw = estado.dados as Record<string, unknown>;
const aguardando = dadosRaw['aguardando_foto_2'] as EstadoAguardandoFoto2['aguardando_foto_2'] | undefined;

if (aguardando && estaNoTimeout(aguardando.timestamp)) {
  // É a 2ª foto — processar com ambas
  await processarDuasFotos(phone, aguardando.foto1_base64, base64NovaFoto);
  await atualizarEstado(paciente.id, { dados: { aguardando_foto_2: undefined } });
} else {
  // É a 1ª foto — salvar e pedir a 2ª
  await atualizarEstado(paciente.id, {
    dados: { aguardando_foto_2: { foto1_message_id: messageId, foto1_base64: base64, timestamp: new Date().toISOString() } },
  });
  await sendText(phone, '📸 Para uma estimativa de porção melhor, mande também uma foto lateral do prato.');
}
```

**Risco:** `foto1_base64` pode ser grande (imagem JPEG 1MB = ~1.3 MB em base64). Armazenar base64 no JSONB do Supabase é aceitável para um campo temporário com timeout de 5 minutos. [ASSUMED — não verificado se há limite de tamanho de coluna JSONB no Supabase; PostgreSQL suporta JSONB ilimitado, mas Supabase pode ter limites de row size — alternativa: armazenar apenas o `messageId` e re-baixar na 2ª mensagem]

### Pattern 7: Registro de Refeição + Saldo do Dia

```typescript
// Schema verificado em migration 20260422000001_create_schema.sql
// tabela refeicoes: id, paciente_id, descricao, kcal, proteina_g, carbo_g, gordura_g, tipo_registro, registrado_em
// tabela registros_diarios: UNIQUE (paciente_id, data) — UPSERT acumula

async function registrarRefeicao(
  pacienteId: string,
  descricao: string,
  macros: MacrosRefeicao,
  tipoRegistro: 'texto' | 'audio' | 'foto' | 'codigo_barras' | 'rotulo',
): Promise<void> {
  // 1. INSERT em refeicoes
  await supabase.from('refeicoes').insert({
    paciente_id: pacienteId,
    descricao,
    kcal: macros.kcal,
    proteina_g: macros.proteina_g,
    carbo_g: macros.carbo_g,
    gordura_g: macros.gordura_g,
    tipo_registro: tipoRegistro,
  });

  // 2. UPSERT em registros_diarios — acumula o dia
  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await supabase.from('registros_diarios').upsert(
    {
      paciente_id: pacienteId,
      data: hoje,
      kcal_consumido: macros.kcal,
      proteina_g: macros.proteina_g,
      carbo_g: macros.carbo_g,
      gordura_g: macros.gordura_g,
    },
    {
      onConflict: 'paciente_id,data',
      // ATENÇÃO: upsert do Supabase sobrescreve, não acumula.
      // Usar SQL raw para incrementar: ver pitfall abaixo.
    },
  );
}
```

**Pitfall crítico — UPSERT não acumula automaticamente:** O Supabase/Postgres UPSERT sobrescreve os campos. Para **acumular** kcal do dia, usar RPC ou SQL raw com `UPDATE ... SET kcal_consumido = kcal_consumido + $1`. Ver seção Pitfalls.

### Pattern 8: Cálculo de Metas (D-08)

```typescript
// Metas derivadas de tdee_kcal salvo em entrevista_dados (Fase 2)
function calcularMetas(tdeeKcal: number): MetasMacros {
  const kcalProteina = tdeeKcal * 0.30;
  const kcalCarbo = tdeeKcal * 0.40;
  const kcalGordura = tdeeKcal * 0.30;
  return {
    kcal: tdeeKcal,
    proteina_g: Math.round(kcalProteina / 4),   // 4 kcal/g
    carbo_g: Math.round(kcalCarbo / 4),          // 4 kcal/g
    gordura_g: Math.round(kcalGordura / 9),      // 9 kcal/g
  };
}
```

### Pattern 9: Substituição de Alimentos (AGENT-16)

```typescript
// Reutiliza rag.ts query() existente — nenhuma alteração necessária
async function sugerirSubstituicao(pacienteId: string, alimentoAusente: string): Promise<string> {
  const contexto = await ragQuery(pacienteId, `substituto para ${alimentoAusente}`);
  if (!contexto) return '';

  // Claude interpreta o contexto RAG para sugerir apenas itens da dieta
  const resposta = await responderComClaude(
    `O paciente não tem "${alimentoAusente}". Com base na dieta prescrita abaixo, sugira alternativas disponíveis.`,
    contexto,
    paciente.nome,
  );
  return resposta;
}
```

---

## Don't Hand-Roll

| Problema | Não Construir | Usar | Por Quê |
|----------|--------------|------|---------|
| Transcrição de áudio | Converter OGG→texto manualmente | `groq-sdk` Whisper | Modelo especializado, suporta sotaques BR, 25MB limite |
| Análise de imagem | Detecção de objetos custom | Claude Vision | Modelo multimodal pronto, suporta base64, sem setup |
| OCR de rótulo | Tesseract ou similar | Claude Vision | Rótulos têm layout variado; Claude entende contexto nutricional |
| Detecção de barcode | Biblioteca de decodificação de pixels (zxing, etc.) | Claude Vision (lê o número) + OFF lookup | WhatsApp comprime imagens; Claude lê o número impresso mesmo com distorção |
| Estimativa de macros | TACO/USDA lookup por string | Claude diretamente (D-01) | Usuário decidiu; variação de 5-15% aceitável |
| Acumulação de macros no dia | Lógica manual de soma | SQL: `UPDATE ... SET x = x + $1` | UPSERT sobrescreve; incremento atômico no DB evita race condition |
| Download de mídia | Parsear URL do WhatsApp diretamente | Evolution API `/chat/getBase64FromMediaMessage` | URLs de mídia do WhatsApp expiram e requerem auth do servidor |

---

## Common Pitfalls

### Pitfall 1: UPSERT Supabase Sobrescreve em vez de Acumular

**O que dá errado:** `supabase.from('registros_diarios').upsert({kcal_consumido: 500})` sobrescreve o registro existente com 500 em vez de somar. O segundo almoço apaga o café da manhã.

**Por que acontece:** UPSERT Supabase usa `INSERT ... ON CONFLICT DO UPDATE SET` e sobrescreve os campos especificados.

**Como evitar:** Usar RPC Supabase ou SQL raw com incremento atômico:
```sql
INSERT INTO registros_diarios (paciente_id, data, kcal_consumido, proteina_g, carbo_g, gordura_g)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (paciente_id, data)
DO UPDATE SET
  kcal_consumido = registros_diarios.kcal_consumido + EXCLUDED.kcal_consumido,
  proteina_g = registros_diarios.proteina_g + EXCLUDED.proteina_g,
  carbo_g = registros_diarios.carbo_g + EXCLUDED.carbo_g,
  gordura_g = registros_diarios.gordura_g + EXCLUDED.gordura_g,
  updated_at = now();
```
Criar como função RPC no Supabase para chamar via `.rpc('acumular_refeicao', {...})`.

**Sinal de alerta:** Saldo do dia mostra apenas a última refeição registrada.

---

### Pitfall 2: Formato OGG/OPUS do WhatsApp vs Whisper

**O que dá errado:** WhatsApp envia áudio como `audio/ogg; codecs=opus`. O Groq Whisper aceita OGG, mas se o backend passar `mimetype` completo com `; codecs=opus`, o `Content-Type` do multipart pode rejeitar o arquivo.

**Por que acontece:** O `mimetype` no payload Evolution API v2 inclui parâmetros adicionais (ex: `audio/ogg; codecs=opus`), mas `toFile()` espera um MIME type limpo.

**Como evitar:**
```typescript
const mimeClean = mimetype.split(';')[0].trim(); // "audio/ogg; codecs=opus" → "audio/ogg"
const ext = mimeClean.split('/')[1]; // "ogg"
const audioFile = await toFile(buffer, `audio.${ext}`, { type: mimeClean });
```

**Sinal de alerta:** Groq retorna erro 400 "Invalid file format".

---

### Pitfall 3: Claude Vision Retorna JSON Inválido

**O que dá errado:** Claude responde com markdown (```json ... ```) em vez de JSON puro quando o modelo "quer ser útil". `JSON.parse()` lança exceção.

**Por que acontece:** Mesmo com instrução "responda APENAS com JSON", Claude às vezes inclui formatação de markdown.

**Como evitar:**
```typescript
function extrairJSON(texto: string): unknown {
  // Remove blocos de código markdown se presentes
  const limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(limpo);
}
```

**Sinal de alerta:** Erro `SyntaxError: Unexpected token` ao processar resposta de visão.

---

### Pitfall 4: Timeout de 2ª Foto com Estado Corrompido

**O que dá errado:** Estado `aguardando_foto_2` fica indefinidamente em `entrevista_dados` se: (a) o timeout de 5 min passa sem 2ª foto, e (b) a próxima mensagem é texto (não imagem). O bot começa a tratar texto como "2ª foto".

**Por que acontece:** A verificação de timeout só acontece em `case "imageMessage"`. Mensagens de texto não limpam o estado.

**Como evitar:** Na função `processarMensagem()` de `agent.ts`, verificar e limpar `aguardando_foto_2` expirado antes de processar qualquer mensagem:
```typescript
const dadosRaw = estado.dados as Record<string, unknown>;
const aguardando = dadosRaw['aguardando_foto_2'] as { timestamp: string } | undefined;
if (aguardando && !estaNoTimeout(aguardando.timestamp)) {
  await atualizarEstado(pacienteId, { dados: { aguardando_foto_2: null } });
  // Processar com 1ª foto via background (ou silenciosamente ignorar)
}
```

**Sinal de alerta:** Bot responde "analisando sua foto" quando paciente envia texto.

---

### Pitfall 5: docker restart Obrigatório Após Editar TypeScript

**O que dá errado:** Código antigo continua rodando no container mesmo após editar `.ts`. `tsx watch` no Docker/Windows não detecta mudanças de volume automaticamente.

**Como evitar:** Após qualquer edição de arquivo TypeScript:
```bash
docker restart nutrichat_backend
```

**Confirmado em CLAUDE.md do projeto.**

---

### Pitfall 6: API Key do Evolution API na Chamada de Download de Mídia

**O que dá errado:** Download de mídia via `/chat/getBase64FromMediaMessage` retorna 401 se o header `apikey` estiver ausente.

**Como evitar:** Sempre incluir `apikey: env.EVOLUTION_API_KEY` no header. A URL interna Docker é `http://nutrichat_evolution:8080` (nome do container) ou `${env.EVOLUTION_API_URL}` que já está configurado como `http://nutrichat_evolution:8080` no docker-compose.

---

## Runtime State Inventory

> Esta fase é expansão de código, não renomeação. Sem runtime state migration.

| Categoria | Itens | Ação |
|-----------|-------|------|
| Stored data | Tabelas `refeicoes` e `registros_diarios` já existem com schema correto | Nenhuma migração — apenas INSERTs |
| Live service config | `aguardando_foto_2` no JSONB `entrevista_dados` é estado transitório em tempo real | Cleanup automático por timeout |
| OS-registered state | Nenhum | — |
| Secrets/env vars | `GROQ_API_KEY` já presente em `env.ts` e no `.env` | Verificar valor preenchido antes de executar |
| Build artifacts | `groq-sdk` não instalado ainda — requer `npm install` + rebuild do container | `npm install groq-sdk && docker-compose build backend` |

---

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|------------|--------------|-----------|--------|----------|
| Evolution API local | Download de mídia | ✓ | v2.3.7 | — |
| Groq API (cloud) | Whisper transcription | ✓ (key em .env) | — | Sem fallback — AGENT-02 bloqueado sem ela |
| Open Food Facts API (cloud) | AGENT-05 | ✓ (pública) | v0 | Claude Vision relê imagem como rótulo |
| Claude API (cloud) | Vision + macro estimation | ✓ (key em .env) | claude-sonnet-4-6 | — |
| `groq-sdk` npm package | AGENT-02, AGENT-14 | ✗ (não instalado) | 1.1.2 | Instalar: `npm install groq-sdk` |
| Supabase projeto | Persistência | ✓ | iqpoohthfhmjkvrqxzns | — |

**Dependências bloqueantes sem fallback:**
- `groq-sdk` não instalado: instalar antes de executar o plano 03-01
- `GROQ_API_KEY` precisa de valor real no `.env`

---

## Validation Architecture

### Test Framework

| Propriedade | Valor |
|-------------|-------|
| Framework | Nenhum detectado no projeto — Wave 0 instala `vitest` (recomendado) |
| Config file | Nenhum — criar `backend/vitest.config.ts` em Wave 0 |
| Quick run command | `cd backend && npx vitest run --reporter=verbose` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Comportamento | Tipo de Teste | Comando Automatizado | Arquivo Existe? |
|--------|---------------|--------------|---------------------|-----------------|
| AGENT-02 | Áudio transcrito → texto | Unit (mock Groq) | `npx vitest run tests/audio.test.ts` | ❌ Wave 0 |
| AGENT-03 | Vision detecta tipo de imagem corretamente | Unit (mock Claude) | `npx vitest run tests/vision.test.ts` | ❌ Wave 0 |
| AGENT-04 | Estado 2-fotos salvo e recuperado corretamente | Unit (mock Supabase) | `npx vitest run tests/vision.test.ts` | ❌ Wave 0 |
| AGENT-05 | Open Food Facts retorna macros por barcode | Integration (HTTP real OFF) | `npx vitest run tests/barcode.test.ts` | ❌ Wave 0 |
| AGENT-06 | Rótulo lido → JSON macros | Unit (mock Claude) | `npx vitest run tests/vision.test.ts` | ❌ Wave 0 |
| AGENT-13 | Texto → macros calculados → INSERT correto | Unit (mock Claude + Supabase) | `npx vitest run tests/meal.test.ts` | ❌ Wave 0 |
| AGENT-14 | Pipeline áudio→texto→registro end-to-end | Integration | Manual (WhatsApp real) | — |
| AGENT-15 | Saldo do dia acumula corretamente (não sobrescreve) | Unit (mock Supabase) | `npx vitest run tests/meal.test.ts` | ❌ Wave 0 |
| AGENT-16 | Substituição usa RAG, não inventa | Unit (mock RAG) | `npx vitest run tests/meal.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `backend/vitest.config.ts` — configuração de test runner
- [ ] `backend/tests/audio.test.ts` — cobre AGENT-02
- [ ] `backend/tests/vision.test.ts` — cobre AGENT-03, AGENT-04, AGENT-06
- [ ] `backend/tests/barcode.test.ts` — cobre AGENT-05
- [ ] `backend/tests/meal.test.ts` — cobre AGENT-13, AGENT-15, AGENT-16
- [ ] Framework install: `cd backend && npm install -D vitest`

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| Categoria ASVS | Aplica | Controle |
|---------------|--------|----------|
| V2 Authentication | Não | Webhook interno sem auth pública |
| V3 Session Management | Não | Sem sessões — stateless via Supabase |
| V4 Access Control | Sim | paciente só acessa próprios dados — RLS Supabase já habilitado nas tabelas (migration 003) |
| V5 Input Validation | Sim | Macros recebidos de Claude e Open Food Facts — validar tipos antes de INSERT |
| V6 Cryptography | Não | Sem operações criptográficas novas |

### Threat Patterns

| Pattern | STRIDE | Mitigação |
|---------|--------|-----------|
| Webhook sem validação de origem | Spoofing | API key do Evolution API no header já presente; para segurança adicional, verificar `instance` no payload |
| Macros com NaN ou null causam corrompimento do saldo | Tampering | Sanitizar valores numéricos antes de INSERT: `isNaN(v) || v < 0 ? 0 : v` |
| Base64 de imagem maliciosa enviada ao Claude | — | Claude não executa código; risco de conteúdo CSAM — Claude recusa automaticamente |
| Barcode lookup com código arbitrário | Information Disclosure | Open Food Facts é pública — nenhum dado sensível exposto |
| `entrevista_dados` JSONB pode ser corrompido por update parcial | Tampering | `atualizarEstado` já faz merge profundo — padrão estabelecido na Fase 2 |

---

## State of the Art

| Abordagem Antiga | Abordagem Atual | Relevância |
|-----------------|-----------------|-----------|
| Transcrição local (Whisper auto-hospedado) | Groq API — mesma qualidade, 10-20x mais rápido | Groq Whisper é padrão de produção para apps de baixo volume |
| Detecção de barcode por biblioteca (zxing) | Leitura visual do número pelo LLM + lookup | Mais robusto para fotos com distorção/compressão WhatsApp |
| OCR tradicional (Tesseract) para rótulos | Claude Vision | Zero configuração, entende contexto nutricional |

---

## Open Questions

1. **Estrutura exata da resposta do `/chat/getBase64FromMediaMessage`**
   - O que sabemos: Endpoint existe e retorna 400 para ID inválido (confirmado localmente). Issues #942 e #2091 do GitHub indicam `{ base64: string, mimetype: string }`.
   - O que não sabemos: Campo exato do base64 na resposta JSON (pode ser `base64`, `media`, `data`, etc.)
   - Recomendação: No Wave 0 do plano 03-01, fazer um teste manual com mensagem de áudio real e logar a resposta completa antes de implementar.

2. **Limite de tamanho do JSONB para foto1_base64**
   - O que sabemos: PostgreSQL suporta JSONB ilimitado; foto JPEG típica de WhatsApp tem ~100-400 KB (base64 ~130-530 KB por campo)
   - O que não sabemos: Se o Supabase impõe limite de row size para operações de `update`
   - Recomendação: Armazenar apenas o `messageId` como alternativa mais leve, e re-baixar a 1ª foto quando a 2ª chegar. Decide no plano.

3. **Suporte de `audio/ogg;codecs=opus` no Groq Whisper**
   - O que sabemos: Groq documenta OGG como suportado; WhatsApp envia `audio/ogg;codecs=opus`
   - O que não sabemos: Se o codec OPUS dentro do OGG é suportado sem conversão
   - Recomendação: Plano 03-01 inclui teste com áudio real no Wave 0.

---

## Assumptions Log

| # | Claim | Seção | Risco se Errado |
|---|-------|-------|-----------------|
| A1 | Resposta do `/chat/getBase64FromMediaMessage` tem campo `base64` e `mimetype` | Pattern 1, Code Examples | Download de mídia falha — precisaria ajustar field names |
| A2 | Armazenar base64 de foto (~300 KB) em JSONB do Supabase não causa problemas de performance ou limite | Pattern 6 | Estado não salva — fallback: armazenar apenas messageId |
| A3 | `audio/ogg;codecs=opus` (formato WhatsApp) é aceito pelo Groq Whisper sem conversão | Pattern 2 | Transcrição falha — precisaria adicionar ffmpeg para conversão |

---

## Sources

### Primary (HIGH confidence)
- `@anthropic-ai/sdk` 0.91.0 — npm registry (`npm view @anthropic-ai/sdk version`)
- `groq-sdk` 1.1.2 — npm registry (`npm view groq-sdk version`)
- platform.claude.com/docs/claude/docs/vision — content block TypeScript, MIME types, token costs (verificado via WebFetch)
- console.groq.com/docs/speech-to-text — `audio.transcriptions.create`, `toFile`, modelos disponíveis (verificado via WebFetch)
- openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/ — endpoint format, `status`, `nutriments.*_100g` fields (verificado via WebFetch)
- `supabase/migrations/20260422000001_create_schema.sql` — schema `refeicoes`, `registros_diarios`, `UNIQUE(paciente_id, data)` (verificado via Read)
- `backend/src/services/conversation.ts` — `getEstado`/`atualizarEstado` pattern (verificado via Read)
- `backend/src/services/agent.ts` — `responderComClaude`, `processarMensagem` (verificado via Read)
- `backend/src/config/env.ts` — `GROQ_API_KEY` presente (verificado via Read)

### Secondary (MEDIUM confidence)
- doc.evolution-api.com/v2/api-reference/chat-controller/get-base64 — endpoint `/chat/getBase64FromMediaMessage/{instance}`, payload `{message:{key:{id}}, convertToMp4}` (verificado via WebFetch, resposta JSON não totalmente documentada)
- GitHub issues #942, #2091 EvolutionAPI — comportamento de base64 em webhook de mídia (MEDIUM — issues, não documentação oficial)

### Tertiary (LOW confidence)
- Estrutura exata da resposta JSON de `/chat/getBase64FromMediaMessage` (campo `base64`) — inferida de múltiplos issues do GitHub, não verificada com mensagem real

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas no npm registry + arquivos do projeto
- Architecture patterns: HIGH — baseado em código existente lido + documentação oficial das APIs
- Integração Evolution API media download: MEDIUM — endpoint confirmado, resposta JSON assumida
- Pitfalls: HIGH — 3 dos 6 baseados em código concreto lido; 3 são derivados de documentação oficial

**Research date:** 2026-04-24
**Valid until:** 2026-07-24 (APIs estáveis; groq-sdk atualiza frequentemente — re-verificar versão antes de instalar)
