// P0-3 — Flag de suplementos controlados.
// Paciente lista o que toma em texto livre (etapa 13 da entrevista). Antes,
// o NutriChat tratava tudo como string e so olhava "creatina" pra calcular
// dose. Agora classifica em 3 baldes:
//
//   seguros       — itens reconhecidos como suplementos alimentares comuns.
//   desconhecidos — itens fora das listas (pode ser marca, abreviacao, typo,
//                   ou suplemento legitimo que ainda nao mapeamos).
//   controlados   — substancias proibidas/controladas que NAO sao suplemento
//                   alimentar (anabolizantes, hormonios, doping). Disparam
//                   aviso para o paciente e flag pro nutricionista.
//
// O matching e case-insensitive, ignora acentos e tolera variacoes de palavra
// composta ("clenbuterol" / "clembuterol"). Conservador: prefere classificar
// como "desconhecido" do que como "seguro" sem certeza. NUNCA classifica como
// "controlado" sem match exato — risco de falso positivo derruba a confianca
// no aviso.

const SUPLEMENTOS_SEGUROS: string[] = [
  // proteinas
  'whey', 'whey protein', 'whey isolado', 'whey concentrado', 'caseina', 'caseína',
  'albumina', 'proteina vegetal', 'proteína vegetal', 'proteina de ervilha', 'proteína de soja',
  // aminoacidos
  'bcaa', 'glutamina', 'arginina', 'beta-alanina', 'beta alanina', 'citrulina', 'taurina',
  'creatina', 'leucina', 'lisina', 'triptofano',
  // energia/treino
  'cafeina', 'cafeína', 'pre-treino', 'pré-treino', 'pre treino', 'pre-workout',
  'maltodextrina', 'dextrose', 'waxy maize', 'hipercalorico', 'hipercalórico',
  'palatinose', 'carbo gel',
  // vitaminas/minerais
  'multivitaminico', 'multivitamínico', 'polivitaminico',
  'vitamina a', 'vitamina b', 'vitamina b12', 'vitamina b6', 'vitamina c', 'vitamina d',
  'vitamina d3', 'vitamina e', 'vitamina k', 'complexo b',
  'magnesio', 'magnésio', 'zinco', 'ferro', 'calcio', 'cálcio', 'potassio', 'potássio',
  'selenio', 'selênio', 'cromo', 'iodo',
  // omega/oleos
  'omega 3', 'omega-3', 'ômega 3', 'ômega-3', 'oleo de peixe', 'óleo de peixe', 'oleo de coco',
  'oleo de linhaca', 'tcm', 'mct',
  // saude geral
  'colageno', 'colágeno', 'colageno hidrolisado', 'glucosamina', 'condroitina',
  'probiotico', 'probiótico', 'prebiotico', 'prebiótico', 'fibra', 'psyllium',
  // fitoterapicos comuns
  'cha verde', 'chá verde', 'cha-verde', 'curcuma', 'cúrcuma', 'gengibre', 'ginkgo', 'ginseng',
  'maca peruana', 'spirulina', 'chlorella',
  // melatonina/sono — controlada no BR ate 2021, hoje liberada como suplemento
  'melatonina',
];

// Substancias controladas/proibidas. Maioria sao anabolizantes androgenicos,
// hormonios de crescimento ou beta-agonistas. Lista nao exaustiva — foca nos
// nomes mais comuns que aparecem em fala leiga.
const SUPLEMENTOS_CONTROLADOS: Record<string, string> = {
  // beta-agonistas (doping, broncodilatador veterinario)
  'clembuterol': 'beta-agonista, banido pela WADA, uso veterinario',
  'clenbuterol': 'beta-agonista, banido pela WADA, uso veterinario',
  'salbutamol': 'beta-agonista, controlado',
  // anabolizantes androgenicos
  'stanozolol': 'anabolizante androgenico',
  'winstrol': 'anabolizante androgenico (stanozolol)',
  'oxandrolona': 'anabolizante androgenico',
  'anavar': 'anabolizante androgenico (oxandrolona)',
  'testosterona': 'hormonio masculino, uso so com prescricao endocrino',
  'durateston': 'esteres de testosterona',
  'deca-durabolin': 'nandrolona, anabolizante',
  'deca durabolin': 'nandrolona, anabolizante',
  'nandrolona': 'anabolizante androgenico',
  'dianabol': 'metandrostenolona, anabolizante',
  'metandrostenolona': 'anabolizante androgenico',
  'trembolona': 'anabolizante veterinario',
  'tren': 'anabolizante veterinario (trembolona)',
  'hemogenin': 'oximetolona, anabolizante',
  'oximetolona': 'anabolizante androgenico',
  'masteron': 'drostanolona, anabolizante',
  // hormonios
  'gh': 'hormonio do crescimento, prescricao endocrino',
  'hgh': 'hormonio do crescimento humano',
  'somatropina': 'hormonio do crescimento sintetico',
  'igf-1': 'fator de crescimento, controlado',
  'epo': 'eritropoietina, banida em esporte',
  'eritropoietina': 'banida pela WADA',
  // sarms
  'ostarine': 'SARM, sem aprovacao da ANVISA',
  'ligandrol': 'SARM, sem aprovacao da ANVISA',
  'lgd-4033': 'SARM, sem aprovacao da ANVISA',
  'mk-677': 'secretagogo de GH, sem aprovacao',
  'rad-140': 'SARM, sem aprovacao da ANVISA',
  // emagrecedores controlados
  'sibutramina': 'controlado, prescricao especial',
  'anfepramona': 'anorexigeno, controlado',
  'efedrina': 'simpaticomimetico, controlado',
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^\w\s-]/g, ' ')        // pontuacao -> espaco
    .replace(/\s+/g, ' ')
    .trim();
}

// Match exato apos normalizacao. Para controlados usamos chaves do dicionario;
// para seguros usamos lista achatada. Substring match e usado SOMENTE para
// seguros (ex.: "whey protein iso" bate em "whey"). Para controlados o match
// e por palavra inteira pra reduzir falso positivo.
export interface AnaliseSuplementos {
  seguros: string[];
  desconhecidos: string[];
  controlados: Array<{ nome: string; motivo: string }>;
}

export function analisarSuplementos(itens: string[] | undefined): AnaliseSuplementos {
  const resultado: AnaliseSuplementos = { seguros: [], desconhecidos: [], controlados: [] };
  if (!itens || itens.length === 0) return resultado;

  const segurosNorm = SUPLEMENTOS_SEGUROS.map(normalizar);
  const controladosNorm = Object.fromEntries(
    Object.entries(SUPLEMENTOS_CONTROLADOS).map(([k, v]) => [normalizar(k), v]),
  );

  for (const item of itens) {
    const norm = normalizar(item);
    if (!norm) continue;

    // 1. Controlado — match por palavra inteira em qualquer chave.
    let controlado: { nome: string; motivo: string } | null = null;
    for (const [chave, motivo] of Object.entries(controladosNorm)) {
      const re = new RegExp(`(?:^|\\W)${chave.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\W|$)`);
      if (re.test(` ${norm} `)) {
        controlado = { nome: item.trim(), motivo };
        break;
      }
    }
    if (controlado) {
      resultado.controlados.push(controlado);
      continue;
    }

    // 2. Seguro — substring tolerante.
    const seguro = segurosNorm.some((s) => norm.includes(s));
    if (seguro) {
      resultado.seguros.push(item.trim());
      continue;
    }

    // 3. Desconhecido.
    resultado.desconhecidos.push(item.trim());
  }

  return resultado;
}

// Mensagem de aviso enviada ao paciente quando ha pelo menos um suplemento
// controlado. Lista os itens com motivo; tom firme mas nao alarmista; deixa
// claro que o nutricionista sera notificado. NAO recomenda parar nem trocar
// dose — isso e responsabilidade do nutricionista/medico.
export function formatarAvisoControlados(
  controlados: Array<{ nome: string; motivo: string }>,
  nomePaciente: string,
): string {
  if (controlados.length === 0) return '';
  const lista = controlados
    .map((c) => `• *${c.nome}* — ${c.motivo}`)
    .join('\n');
  const plural = controlados.length > 1 ? 's' : '';
  return (
    `⚠️ *Atencao, ${nomePaciente}.*\n\n` +
    `Voce mencionou a${plural === 's' ? 's' : ''} seguinte${plural} substancia${plural} controlada${plural}:\n\n` +
    `${lista}\n\n` +
    `_Essas substancias nao sao suplemento alimentar comum._ Nao posso recomendar dosagem nem orientar uso — isso e atribuicao exclusiva de medico/nutricionista com prescricao formal.\n\n` +
    `Vou registrar essa informacao pra que seu nutricionista veja e oriente voce com seguranca. Se nao houver prescricao formal, *converse com ele(a) antes de continuar usando.*`
  );
}
