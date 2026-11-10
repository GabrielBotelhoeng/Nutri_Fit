# Painel de adesão do nutricionista — design

**Data:** 2026-11-09
**Branch:** `feat/painel-adesao` (base: `feat/peso-lembretes-inteligentes`, PR #6 — PR empilhado)
**Status:** aprovado em conversa, aguardando revisão da spec

## Objetivo

Dar ao nutricionista (quem compra o NutriChat single-tenant) visão de quem está aderindo e
quem está escorregando, sem abrir paciente por paciente:

1. **Triagem na lista** — card "⚠ Atenção" + colunas de adesão, último registro e peso.
2. **Ficha do paciente** — 14 dias de kcal/proteína/água vs meta e a curva de peso, para
   preparar a consulta.

## Fora de escopo

- Exportar PDF, detalhe por refeição, alertas ao nutricionista por e-mail/WhatsApp.
- Biblioteca de gráficos (SVG/CSS próprios).
- Migration nova (usa `pesagens` e `ultima_refeicao_por_paciente` do PR #6).
- Testes automatizados no painel (o painel não tem infraestrutura de testes hoje).

## Definições (uma fonte de verdade, no backend)

- **Dia com registro:** `registros_diarios.kcal_consumido > 0` naquela data (mesmo critério
  do relatório semanal).
- **Adesão 7d:** dias com registro em `[hoje−7, hoje−1]` (7 dias completos; hoje não conta,
  para o paciente não parecer mal pela manhã). "Hoje" = `hojeLocal()`.
- **Último registro:** `ultima_refeicao_por_paciente(ids)` (RPC do PR #6).
- **Precisa de atenção:** paciente com `status !== 'expirado'` **e** pelo menos uma:
  - `sem_registro_48h`: última refeição há ≥ 48 h; se nunca registrou, conta a partir de
    `created_at` (cadastro com < 48 h nunca entra) — mesma regra do "Sumiu?" do bot;
  - `baixa_adesao`: adesão 7d ≤ 2 **e** cadastro há ≥ 7 dias (paciente novo não é punido
    pelos dias antes de existir).
  Quando os dois valem, `motivo = 'sem_registro_48h'` (o mais grave).
- **Peso atual / tendência:** última pesagem; tendência compara com a pesagem anterior ou,
  sem ela, com `entrevista_dados.peso_kg`: `desceu` / `subiu` se |Δ| ≥ 0,1 kg, senão
  `estavel`; `null` sem base de comparação ou sem pesagem.

## Backend

### Função pura `resumirAdesao` (novo `backend/src/services/adesao.ts`)

```ts
interface EntradaAdesao {
  agora: Date;
  hoje: string;                       // YYYY-MM-DD local
  criadoEm: Date;
  expirado: boolean;
  diasComKcal: string[];              // datas (YYYY-MM-DD) com kcal > 0, qualquer janela
  ultimaRefeicaoEm: Date | null;
  pesagens: { data: string; peso_kg: number }[];   // ascendente
  pesoInicialKg: number | null;
}
interface ResumoAdesao {
  dias_com_registro_7d: number;
  ultimo_registro_em: string | null;  // ISO
  peso_atual_kg: number | null;
  peso_tendencia: 'subiu' | 'desceu' | 'estavel' | null;
  precisa_atencao: boolean;
  motivo: 'sem_registro_48h' | 'baixa_adesao' | null;
}
```

### `GET /api/pacientes` (existente, `routes/pacientes.ts`)

Passa a incluir `adesao: ResumoAdesao` em cada paciente. Carregado em lote, só para os ids
da lista:
- `registros_diarios` (`paciente_id, data`) com `kcal_consumido > 0` e `data` em `[hoje−7, hoje−1]` — ≤ 7 linhas/paciente;
- RPC `ultima_refeicao_por_paciente(ids)` — 1 linha/paciente;
- `pesagens` (`paciente_id, data, peso_kg`) dos últimos 90 dias, ordem ascendente;
- `entrevista_dados->peso_kg` vem no select de `pacientes` (`peso_inicial:entrevista_dados->peso_kg`).

Falha em qualquer dessas buscas: lista sai normalmente com `adesao: null` em todos e log de
erro — a lista de pacientes nunca quebra por causa da adesão.

Volume: com 1000 linhas de `max_rows`, as buscas de registros (≤ 7/paciente) e pesagens
cabem até ~140 pacientes; acima disso a pesagem é truncada. Aceito para single-tenant
(um nutricionista); documentado no código.

### `GET /api/pacientes/:id/adesao` (novo)

```json
{
  "metas": { "kcal": 2000, "proteina_g": 150, "agua_ml": 2500 },
  "dias": [{ "data": "2026-10-27", "kcal": 1850, "proteina_g": 120, "agua_ml": 2000 }],
  "pesagens": [{ "data": "2026-10-01", "peso_kg": 82.0 }],
  "peso_inicial_kg": 82.5,
  "resumo": { "...": "ResumoAdesao" }
}
```

- `dias`: sempre 14 entradas, `[hoje−13, hoje]` (inclui hoje, marcado como parcial no
  painel), dias sem registro com zeros.
- `metas` via `obterMetas(entrevista_dados)` (mesma função do bot/relatório).
- `pesagens`: últimos 90 dias.
- 404 se o paciente não existe; 500 com log em erro de banco.
- Protegido pelo `requireAuth` já aplicado ao router.

## Painel (`nutrichat-painel/`)

### Lista (`pages/Dashboard.tsx`)
- Tipo `Paciente` ganha `adesao: ResumoAdesao | null`.
- **Card "⚠ Atenção"** (tom `warning`/`danger` existente), valor = nº com
  `precisa_atencao`, clicável como filtro (`FiltroStatus` ganha `'atencao'`).
- **Colunas novas:** "Adesão 7d" (barra de 7 segmentos + "6/7"), "Último registro"
  ("hoje", "ontem", "há N dias", "nunca"; ⚠ quando `motivo = 'sem_registro_48h'`),
  "Peso" ("78,4 ↓" / "—"). Ordenável por adesão.
- Cards mobile ganham as mesmas três informações.
- `adesao: null` → "—" nas colunas e paciente fora do filtro de atenção.

### Ficha (`components/AdesaoModal.tsx`, novo)
- Abre ao clicar no nome do paciente (o botão "Editar" segue abrindo `PacienteModal`).
- Busca `GET /api/pacientes/:id/adesao` ao abrir; estados de carregando e erro.
- **Kcal 14 dias:** barras verticais (SVG) com a linha da meta; hoje com opacidade menor e
  rótulo "parcial"; dia sem registro mostra marcador vazio.
- **Proteína e água:** linha de 14 valores compactos vs meta (% da meta por dia).
- **Peso:** linha SVG das pesagens + "82,0 → 78,4 kg (−3,6)"; sem pesagens: "Sem
  pesagens ainda — o paciente pode mandar 'pesei 78,5' no WhatsApp."
- Sem nenhum registro em 14 dias: estado vazio explicativo.
- Fecha com Esc/clique fora, mesmo padrão do `PacienteModal`; funciona em 360 px.

## Testes

- `backend/tests/adesao.test.ts`: `resumirAdesao` — janela 7d (hoje fora, hoje−7 dentro,
  hoje−8 fora), 48 h, nunca registrou (novo e antigo), baixa adesão com paciente novo,
  expirado nunca em atenção, motivo prioritário, tendência de peso (anterior, inicial,
  estável < 0,1, sem base).
- `backend/tests/pacientes-adesao.test.ts`: os dois endpoints com Supabase mockado —
  `adesao` presente, falha nas buscas → `adesao: null` e 200, ficha com 14 dias
  preenchidos com zeros, 404.
- Painel: `npm run build` + `npm run lint` verdes; conferência visual local (backend local
  + `seed-painel`) em desktop e 360 px.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `backend/src/services/adesao.ts` (+ teste) | novo |
| `backend/src/routes/pacientes.ts` (+ teste) | `adesao` na lista + rota `/:id/adesao` |
| `nutrichat-painel/src/pages/Dashboard.tsx` | card, colunas, filtro, abrir ficha |
| `nutrichat-painel/src/components/AdesaoModal.tsx` | novo |
| `nutrichat-painel/src/lib/adesao.ts` | tipos + formatação ("há N dias", barra) |
