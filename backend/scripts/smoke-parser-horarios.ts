/**
 * Smoke do parser de horarios das refeicoes (#4 Fatia 1).
 *
 * O parser e privado a agent.ts. Reimplementamos aqui o algoritmo identico
 * para validar o comportamento por casos sem expor superficie publica.
 * Se este smoke divergir do agent.ts em refatoracoes futuras, alinhe ambos.
 *
 * Rodar dentro do container:
 *   docker exec nutrichat_backend npx tsx scripts/smoke-parser-horarios.ts
 */

function formatarHoraValida(h: number, m: number): string | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function parseHorariosRefeicoes(texto: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  const t = texto.toLowerCase();
  const horaRe = /(\d{1,2})[:hH](?:(\d{2}))?/g;

  const keywords: Array<[string, RegExp]> = [
    ['lanche_manha', /(lanche[^,;.]{0,15}(manh|manh[ãa])|colac[aã]o|colacao)/],
    ['lanche_tarde', /(lanche[^,;.]{0,15}tarde|merenda|tarde[^,;.]{0,15}lanche)/],
    ['cafe', /(caf[eé](?:\s+da\s+manh[ãa])?|manh[ãa]\b)/],
    ['almoco', /(almo[çc]?o)/],
    ['jantar', /(jantar|janta\b|ceia|noite\b)/],
  ];

  const ocupados = new Set<number>();
  for (const [key, kwRe] of keywords) {
    const kwMatch = t.match(kwRe);
    if (!kwMatch) continue;
    const idx = kwMatch.index ?? 0;
    if ([...Array(kwMatch[0].length).keys()].some((i) => ocupados.has(idx + i))) continue;
    const janela = t.slice(idx, Math.min(t.length, idx + kwMatch[0].length + 25));
    const horaMatch = janela.match(/(\d{1,2})[:hH](?:(\d{2}))?/);
    if (!horaMatch) continue;
    const h = parseInt(horaMatch[1], 10);
    const m = horaMatch[2] ? parseInt(horaMatch[2], 10) : 0;
    const hora = formatarHoraValida(h, m);
    if (!hora) continue;
    resultado[key] = hora;
    const horaIdx = (horaMatch.index ?? 0) + idx;
    for (let i = idx; i < idx + kwMatch[0].length; i++) ocupados.add(i);
    for (let i = horaIdx; i < horaIdx + horaMatch[0].length; i++) ocupados.add(i);
  }

  if (Object.keys(resultado).length > 0) return resultado;

  const todasHoras = [...t.matchAll(horaRe)]
    .map((m) => {
      const h = parseInt(m[1], 10);
      const mm = m[2] ? parseInt(m[2], 10) : 0;
      return formatarHoraValida(h, mm);
    })
    .filter((x): x is string => x !== null);

  if (todasHoras.length === 3) {
    const keys = ['cafe', 'almoco', 'jantar'];
    todasHoras.forEach((h, i) => { resultado[keys[i]] = h; });
  } else if (todasHoras.length >= 5) {
    const keys = ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar'];
    for (let i = 0; i < 5; i++) resultado[keys[i]] = todasHoras[i];
  }

  return resultado;
}

interface Caso {
  label: string;
  input: string;
  esperado: Record<string, string>;
}

const CASOS: Caso[] = [
  {
    label: '3 refeicoes com keywords',
    input: 'cafe 7h, almoco 12h30, jantar 20h',
    esperado: { cafe: '07:00', almoco: '12:30', jantar: '20:00' },
  },
  {
    label: '5 refeicoes com keywords',
    input: 'cafe 7h, lanche da manha 10h, almoco 12h30, lanche da tarde 16h, jantar 20h',
    esperado: {
      cafe: '07:00',
      lanche_manha: '10:00',
      almoco: '12:30',
      lanche_tarde: '16:00',
      jantar: '20:00',
    },
  },
  {
    label: '5 horarios sem keywords — fallback por ordem',
    input: '7h, 10h, 12h30, 16h, 20h',
    esperado: {
      cafe: '07:00',
      lanche_manha: '10:00',
      almoco: '12:30',
      lanche_tarde: '16:00',
      jantar: '20:00',
    },
  },
  {
    label: '3 horarios sem keywords — fallback por ordem',
    input: '7h, 12h30, 20h',
    esperado: { cafe: '07:00', almoco: '12:30', jantar: '20:00' },
  },
  {
    label: 'formato HH:MM puro',
    input: 'café 07:00, almoço 12:30, jantar 19:30',
    esperado: { cafe: '07:00', almoco: '12:30', jantar: '19:30' },
  },
  {
    label: 'minuto colado (7h00 / 19h30)',
    input: 'cafe 7h00, almoco 12h, jantar 19h30',
    esperado: { cafe: '07:00', almoco: '12:00', jantar: '19:30' },
  },
];

let falhas = 0;
let sucessos = 0;

for (const c of CASOS) {
  const out = parseHorariosRefeicoes(c.input);
  const okKeys = Object.keys(c.esperado).length === Object.keys(out).length;
  const okValues = Object.entries(c.esperado).every(([k, v]) => out[k] === v);
  const ok = okKeys && okValues;
  if (ok) {
    sucessos++;
    console.log(`✓ ${c.label}`);
  } else {
    falhas++;
    console.log(`✗ ${c.label}`);
    console.log(`  input:    "${c.input}"`);
    console.log(`  esperado: ${JSON.stringify(c.esperado)}`);
    console.log(`  obtido:   ${JSON.stringify(out)}`);
  }
}

console.log(`\n=== ${sucessos}/${CASOS.length} casos OK ===`);
if (falhas > 0) process.exit(1);
