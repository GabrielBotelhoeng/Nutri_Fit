// Classificação em 3 baldes (seguros / desconhecidos / controlados) + sugestão de dose.
// Conservador: prefere "desconhecido" a "seguro" sem certeza. "Controlado" exige match de
// palavra inteira — falso positivo derruba confiança do paciente no bot.

type CategoriaSeguro = 'proteina' | 'estimulante' | 'omega' | 'outro';

// Substrings ordenadas por especificidade — "whey protein" antes de "whey" genérico.
const SEGUROS_POR_CATEGORIA: Array<{ padrao: string; categoria: CategoriaSeguro }> = [
  { padrao: 'whey protein', categoria: 'proteina' },
  { padrao: 'whey isolado', categoria: 'proteina' },
  { padrao: 'whey concentrado', categoria: 'proteina' },
  { padrao: 'whey', categoria: 'proteina' },
  { padrao: 'caseina', categoria: 'proteina' },
  { padrao: 'albumina', categoria: 'proteina' },
  { padrao: 'proteina vegetal', categoria: 'proteina' },
  { padrao: 'proteina de ervilha', categoria: 'proteina' },
  { padrao: 'proteina de soja', categoria: 'proteina' },
  { padrao: 'pre-treino', categoria: 'estimulante' },
  { padrao: 'pre treino', categoria: 'estimulante' },
  { padrao: 'pre-workout', categoria: 'estimulante' },
  { padrao: 'cafeina', categoria: 'estimulante' },
  { padrao: 'cha verde', categoria: 'estimulante' },
  { padrao: 'cha-verde', categoria: 'estimulante' },
  { padrao: 'sinefrina', categoria: 'estimulante' },
  { padrao: 'guarana', categoria: 'estimulante' },
  { padrao: 'termogenico', categoria: 'estimulante' },
  { padrao: 'omega 3', categoria: 'omega' },
  { padrao: 'omega-3', categoria: 'omega' },
  { padrao: 'oleo de peixe', categoria: 'omega' },
  { padrao: 'oleo de linhaca', categoria: 'omega' },
  { padrao: 'bcaa', categoria: 'outro' },
  { padrao: 'glutamina', categoria: 'outro' },
  { padrao: 'arginina', categoria: 'outro' },
  { padrao: 'beta-alanina', categoria: 'outro' },
  { padrao: 'beta alanina', categoria: 'outro' },
  { padrao: 'citrulina', categoria: 'outro' },
  { padrao: 'taurina', categoria: 'outro' },
  { padrao: 'creatina', categoria: 'outro' },
  { padrao: 'leucina', categoria: 'outro' },
  { padrao: 'maltodextrina', categoria: 'outro' },
  { padrao: 'dextrose', categoria: 'outro' },
  { padrao: 'waxy maize', categoria: 'outro' },
  { padrao: 'palatinose', categoria: 'outro' },
  { padrao: 'hipercalorico', categoria: 'outro' },
  { padrao: 'multivitaminico', categoria: 'outro' },
  { padrao: 'polivitaminico', categoria: 'outro' },
  { padrao: 'complexo b', categoria: 'outro' },
  { padrao: 'vitamina a', categoria: 'outro' },
  { padrao: 'vitamina b12', categoria: 'outro' },
  { padrao: 'vitamina b6', categoria: 'outro' },
  { padrao: 'vitamina b', categoria: 'outro' },
  { padrao: 'vitamina c', categoria: 'outro' },
  { padrao: 'vitamina d3', categoria: 'outro' },
  { padrao: 'vitamina d', categoria: 'outro' },
  { padrao: 'vitamina e', categoria: 'outro' },
  { padrao: 'vitamina k', categoria: 'outro' },
  { padrao: 'magnesio', categoria: 'outro' },
  { padrao: 'zinco', categoria: 'outro' },
  { padrao: 'ferro', categoria: 'outro' },
  { padrao: 'calcio', categoria: 'outro' },
  { padrao: 'potassio', categoria: 'outro' },
  { padrao: 'selenio', categoria: 'outro' },
  { padrao: 'cromo', categoria: 'outro' },
  { padrao: 'iodo', categoria: 'outro' },
  { padrao: 'colageno hidrolisado', categoria: 'outro' },
  { padrao: 'colageno', categoria: 'outro' },
  { padrao: 'glucosamina', categoria: 'outro' },
  { padrao: 'condroitina', categoria: 'outro' },
  { padrao: 'probiotico', categoria: 'outro' },
  { padrao: 'prebiotico', categoria: 'outro' },
  { padrao: 'psyllium', categoria: 'outro' },
  { padrao: 'fibra', categoria: 'outro' },
  { padrao: 'curcuma', categoria: 'outro' },
  { padrao: 'gengibre', categoria: 'outro' },
  { padrao: 'ginkgo', categoria: 'outro' },
  { padrao: 'ginseng', categoria: 'outro' },
  { padrao: 'maca peruana', categoria: 'outro' },
  { padrao: 'spirulina', categoria: 'outro' },
  { padrao: 'chlorella', categoria: 'outro' },
  { padrao: 'melatonina', categoria: 'outro' },
  { padrao: 'mct', categoria: 'outro' },
  { padrao: 'tcm', categoria: 'outro' },
  { padrao: 'oleo de coco', categoria: 'outro' },
];

type CategoriaControlado =
  | 'beta_agonista'
  | 'anabolizante'
  | 'hormonio'
  | 'sarm'
  | 'emagrecedor';

interface DadosControlado {
  motivo: string;
  categoria: CategoriaControlado;
}

export const CONTROLADOS: Record<string, DadosControlado> = {
  'clembuterol': { motivo: 'beta-agonista, banido pela WADA, uso veterinario', categoria: 'beta_agonista' },
  'clenbuterol': { motivo: 'beta-agonista, banido pela WADA, uso veterinario', categoria: 'beta_agonista' },
  'salbutamol': { motivo: 'beta-agonista, uso off-label controlado', categoria: 'beta_agonista' },
  'stanozolol': { motivo: 'anabolizante androgenico', categoria: 'anabolizante' },
  'winstrol': { motivo: 'anabolizante androgenico (stanozolol)', categoria: 'anabolizante' },
  'oxandrolona': { motivo: 'anabolizante androgenico', categoria: 'anabolizante' },
  'anavar': { motivo: 'anabolizante androgenico (oxandrolona)', categoria: 'anabolizante' },
  'testosterona': { motivo: 'hormonio masculino, uso so com prescricao endocrino', categoria: 'anabolizante' },
  'durateston': { motivo: 'esteres de testosterona', categoria: 'anabolizante' },
  'deca-durabolin': { motivo: 'nandrolona, anabolizante', categoria: 'anabolizante' },
  'deca durabolin': { motivo: 'nandrolona, anabolizante', categoria: 'anabolizante' },
  'nandrolona': { motivo: 'anabolizante androgenico', categoria: 'anabolizante' },
  'dianabol': { motivo: 'metandrostenolona, anabolizante', categoria: 'anabolizante' },
  'metandrostenolona': { motivo: 'anabolizante androgenico', categoria: 'anabolizante' },
  'trembolona': { motivo: 'anabolizante veterinario', categoria: 'anabolizante' },
  'tren': { motivo: 'anabolizante veterinario (trembolona)', categoria: 'anabolizante' },
  'hemogenin': { motivo: 'oximetolona, anabolizante', categoria: 'anabolizante' },
  'oximetolona': { motivo: 'anabolizante androgenico', categoria: 'anabolizante' },
  'masteron': { motivo: 'drostanolona, anabolizante', categoria: 'anabolizante' },
  'gh': { motivo: 'hormonio do crescimento, prescricao endocrino', categoria: 'hormonio' },
  'hgh': { motivo: 'hormonio do crescimento humano', categoria: 'hormonio' },
  'somatropina': { motivo: 'hormonio do crescimento sintetico', categoria: 'hormonio' },
  'igf-1': { motivo: 'fator de crescimento, controlado', categoria: 'hormonio' },
  'epo': { motivo: 'eritropoietina, banida em esporte', categoria: 'hormonio' },
  'eritropoietina': { motivo: 'banida pela WADA', categoria: 'hormonio' },
  'ostarine': { motivo: 'SARM, sem aprovacao da ANVISA', categoria: 'sarm' },
  'ligandrol': { motivo: 'SARM, sem aprovacao da ANVISA', categoria: 'sarm' },
  'lgd-4033': { motivo: 'SARM, sem aprovacao da ANVISA', categoria: 'sarm' },
  'mk-677': { motivo: 'secretagogo de GH, sem aprovacao', categoria: 'sarm' },
  'rad-140': { motivo: 'SARM, sem aprovacao da ANVISA', categoria: 'sarm' },
  'sibutramina': { motivo: 'controlado, prescricao especial', categoria: 'emagrecedor' },
  'anfepramona': { motivo: 'anorexigeno, controlado', categoria: 'emagrecedor' },
  'efedrina': { motivo: 'simpaticomimetico, controlado', categoria: 'emagrecedor' },
};

const RISCOS_POR_CATEGORIA: Record<CategoriaControlado, string[]> = {
  beta_agonista: [
    'taquicardia sustentada e arritmia',
    'tremor, sudorese e hipocalemia (potassio baixo)',
    'em uso prolongado: hipertrofia do ventriculo esquerdo, risco de infarto',
    'ha obitos documentados em uso off-label pra emagrecimento',
  ],
  anabolizante: [
    'hepatotoxicidade (dano ao figado, comum em ciclos orais)',
    'piora do perfil lipidico (LDL sobe, HDL desce) e risco cardiovascular',
    'supressão do eixo hormonal próprio, requer PCT médica',
    'ginecomastia, acne, alopecia androgenetica',
  ],
  hormonio: [
    'alteração do eixo endócrino natural',
    'resistencia insulinica e alteração glicemica',
    'em uso não supervisionado: acromegalia, cardiomegalia',
    'risco tumoral (potencial estimulo de tumores existentes)',
  ],
  sarm: [
    'sem estudos de segurança de longo prazo em humanos',
    'hepatotoxicidade e alteração lipidica documentadas',
    'supressão hormonal (menor que anabolizante, mas existe)',
    'contaminacao frequente: analises independentes acham anabolizante em muitos frascos',
  ],
  emagrecedor: [
    'taquicardia, hipertensão e risco cardiovascular',
    'insonia, ansiedade, alteração de humor',
    'dependencia psicologica e efeito rebote ao interromper',
    'requer prescrição médica e acompanhamento (RDC ANVISA)',
  ],
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface AnaliseSuplementos {
  seguros: string[];
  desconhecidos: string[];
  controlados: Array<{ nome: string; motivo: string }>;
}

export function analisarSuplementos(itens: string[] | undefined): AnaliseSuplementos {
  const resultado: AnaliseSuplementos = { seguros: [], desconhecidos: [], controlados: [] };
  if (!itens || itens.length === 0) return resultado;

  const controladosNorm = Object.fromEntries(
    Object.entries(CONTROLADOS).map(([k, v]) => [normalizar(k), v]),
  );

  for (const item of itens) {
    const norm = normalizar(item);
    if (!norm) continue;

    let controlado: { nome: string; motivo: string } | null = null;
    for (const [chave, dados] of Object.entries(controladosNorm)) {
      const re = new RegExp(`(?:^|\\W)${chave.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\W|$)`);
      if (re.test(` ${norm} `)) {
        controlado = { nome: item.trim(), motivo: dados.motivo };
        break;
      }
    }
    if (controlado) {
      resultado.controlados.push(controlado);
      continue;
    }

    const seguro = SEGUROS_POR_CATEGORIA.some((s) => norm.includes(normalizar(s.padrao)));
    if (seguro) {
      resultado.seguros.push(item.trim());
      continue;
    }

    resultado.desconhecidos.push(item.trim());
  }

  return resultado;
}

export function categorizarSeguro(item: string): CategoriaSeguro | null {
  const norm = normalizar(item);
  for (const entrada of SEGUROS_POR_CATEGORIA) {
    if (norm.includes(normalizar(entrada.padrao))) return entrada.categoria;
  }
  return null;
}

export interface SugestaoDose {
  suplemento: string;
  categoria: CategoriaSeguro;
  dose: string;
  timing?: string;
  cautela?: string;
}

// 0.3 g/kg — sugestão pós-treino; scoop convencional ≈ 24g de proteína.
export function calcularDoseWhey(peso_kg: number): SugestaoDose {
  const proteinaG = Math.round(peso_kg * 0.3);
  const scoopEquivalente = Math.max(1, Math.round(proteinaG / 24));
  return {
    suplemento: 'Whey Protein',
    categoria: 'proteina',
    dose: `~${proteinaG}g de proteína/dia (${scoopEquivalente} scoop${scoopEquivalente > 1 ? 's' : ''})`,
    timing: 'pós-treino ou entre refeições, se a proteína do dia ficar abaixo da meta',
    cautela: 'não substitui alimento — é complemento; hidrata bem porque proteína exige mais água',
  };
}

// 3 mg/kg com teto de 400 mg/dia (ANVISA). Pré-treino comercial já entra nesse balde.
export function calcularDoseCafeina(peso_kg: number): SugestaoDose {
  const doseMg = Math.min(400, Math.round(peso_kg * 3));
  return {
    suplemento: 'Cafeína / Pré-treino',
    categoria: 'estimulante',
    dose: `${doseMg} mg/dia (limite ANVISA: 400 mg)`,
    timing: '30-45 min antes do treino',
    cautela: 'evitar após 16h (atrapalha o sono); não empilhar com chá verde, café e pré-treino no mesmo dia',
  };
}

export function calcularDoseOmega(): SugestaoDose {
  return {
    suplemento: 'Omega-3',
    categoria: 'omega',
    dose: '1-2g de EPA+DHA/dia (leia o rotulo — nem toda capsula de 1g tem 1g de EPA+DHA)',
    timing: 'junto a uma refeição com gordura pra melhor absorção',
  };
}

// Só proteína/estimulante/ômega têm cálculo; "outro" vai pro bloco informativo.
export function calcularDoseSuplementos(
  peso_kg: number,
  segurosReportados: string[],
): {
  comCalculo: SugestaoDose[];
  outrosInformados: string[];
} {
  const comCalculo: SugestaoDose[] = [];
  const outrosInformados: string[] = [];
  const jaIncluido = new Set<CategoriaSeguro>();

  for (const item of segurosReportados) {
    const cat = categorizarSeguro(item);
    if (!cat) continue;

    // Uma sugestão por categoria — evita duplicar "whey" + "whey isolado".
    if (cat === 'proteina' && !jaIncluido.has('proteina')) {
      comCalculo.push(calcularDoseWhey(peso_kg));
      jaIncluido.add('proteina');
    } else if (cat === 'estimulante' && !jaIncluido.has('estimulante')) {
      comCalculo.push(calcularDoseCafeina(peso_kg));
      jaIncluido.add('estimulante');
    } else if (cat === 'omega' && !jaIncluido.has('omega')) {
      comCalculo.push(calcularDoseOmega());
      jaIncluido.add('omega');
    } else if (cat === 'outro') {
      outrosInformados.push(item.trim());
    }
  }

  return { comCalculo, outrosInformados };
}

export function formatarMensagemSuplementos(
  sugestoes: SugestaoDose[],
  outrosInformados: string[],
): string {
  if (sugestoes.length === 0 && outrosInformados.length === 0) return '';

  const linhas: string[] = ['💊 *Sobre seus suplementos*\n'];

  for (const s of sugestoes) {
    linhas.push(`*${s.suplemento}*`);
    linhas.push(`• Dose sugerida: ${s.dose}`);
    if (s.timing) linhas.push(`• Quando: ${s.timing}`);
    if (s.cautela) linhas.push(`• Cuidado: ${s.cautela}`);
    linhas.push('');
  }

  if (outrosInformados.length > 0) {
    linhas.push(`*Também anotei:* ${outrosInformados.join(', ')}`);
    linhas.push('_Confirme a dose com seu(sua) nutri — não vou sugerir sem prescrição dele(a)._');
    linhas.push('');
  }

  linhas.push(
    '_Essas são sugestoes iniciais baseadas em referencia (SBP, ISSN, AHA). Seu(sua) nutricionista pode ajustar._',
  );

  return linhas.join('\n');
}

// Só aparece quando há estimulante — não spamma quem toma só whey e vitamina D.
export function formatarExplicacaoTermogenicos(sugestoes: SugestaoDose[]): string {
  const temEstimulante = sugestoes.some((s) => s.categoria === 'estimulante');
  if (!temEstimulante) return '';

  return (
    '🔥 *Termogênicos e estimulantes — como usar sem passar do ponto*\n\n' +
    'Cafeína, chá verde, sinefrina e pré-treino são *estimulantes suaves*. Funcionam ' +
    'aumentando um pouco o gasto calórico e a disposição pro treino, mas não emagrecem ' +
    'sozinhos — o deficit calórico continua sendo o motor.\n\n' +
    '*Efeitos comuns em dose normal:*\n' +
    '• Mais atenção e menos cansaço no treino\n' +
    '• Leve aceleracao do batimento cardiaco\n' +
    '• Boca seca, mais sede\n\n' +
    '*Quando parar ou reduzir:*\n' +
    '• Palpitacao forte, tremor, tontura → reduz a dose ou suspende\n' +
    '• Dificuldade pra dormir → não usa após 16h\n' +
    '• Ansiedade ou irritacao → mesmo esquema, reduzir\n\n' +
    '*Não empilhar:* café + pré-treino + termogênico no mesmo dia estoura o teto de ' +
    '400 mg de cafeína (ANVISA) e pode dar taquicardia. Escolha um.\n\n' +
    'Se você tem *hipertensão, arritmia, ansiedade ou gestação*, converse com seu(sua) ' +
    'nutri antes de continuar — pode ser contraindicado.'
  );
}

// Não recomenda parar/trocar dose — só lista riscos e redireciona pro médico.
export function formatarAvisoControlados(
  controlados: Array<{ nome: string; motivo: string }>,
  nomePaciente: string,
): string {
  if (controlados.length === 0) return '';

  const controladosNorm = Object.fromEntries(
    Object.entries(CONTROLADOS).map(([k, v]) => [normalizar(k), v]),
  );
  const categoriasEncontradas = new Set<CategoriaControlado>();
  for (const c of controlados) {
    const norm = normalizar(c.nome);
    for (const [chave, dados] of Object.entries(controladosNorm)) {
      const re = new RegExp(`(?:^|\\W)${chave.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\W|$)`);
      if (re.test(` ${norm} `)) {
        categoriasEncontradas.add(dados.categoria);
        break;
      }
    }
  }

  const lista = controlados.map((c) => `• *${c.nome}* — ${c.motivo}`).join('\n');
  const plural = controlados.length > 1;

  const riscos: string[] = [];
  for (const cat of categoriasEncontradas) {
    for (const r of RISCOS_POR_CATEGORIA[cat]) riscos.push(`• ${r}`);
  }
  const blocoRiscos = riscos.length > 0
    ? `\n\n*Por que essa preocupacao?* Riscos documentados:\n${riscos.join('\n')}`
    : '';

  const precisaCardio = categoriasEncontradas.has('beta_agonista') ||
    categoriasEncontradas.has('emagrecedor');
  const precisaEndo = categoriasEncontradas.has('anabolizante') ||
    categoriasEncontradas.has('hormonio') ||
    categoriasEncontradas.has('sarm');

  const redirects: string[] = [];
  if (precisaCardio) redirects.push('*cardiologista* (avaliar coracao antes de continuar)');
  if (precisaEndo) redirects.push('*endocrinologista* (avaliar eixo hormonal e prescrição formal)');
  const blocoRedirect = redirects.length > 0
    ? `\n\nAntes de continuar, procure: ${redirects.join(' e ')}.`
    : '';

  return (
    `⚠️ *Atenção, ${nomePaciente}.*\n\n` +
    `Você mencionou ${plural ? 'as seguintes substancias controladas' : 'a seguinte substancia controlada'}:\n\n` +
    `${lista}\n\n` +
    `_Essas substâncias não são suplemento alimentar._ Não posso recomendar dosagem — ` +
    `nutricionista não prescreve medicamento (CFN 656/2020), e essas não têm aprovação ` +
    `ANVISA pra uso humano corriqueiro.` +
    blocoRiscos +
    blocoRedirect +
    `\n\nVou registrar isso pra seu(sua) nutri saber e conversar contigo com segurança.`
  );
}

const PALAVRAS_DOSE = [
  'quanto', 'quantos', 'quantas', 'como tomar', 'como usar', 'como faco',
  'como comeco', 'como iniciar', 'dose', 'dosagem', 'ciclo', 'protocolo',
  'posso tomar', 'posso usar', 'devo tomar', 'devo usar', 'quero tomar',
  'quero usar', 'quero comecar', 'estou tomando', 'to tomando', 'tomo',
  'ml', 'mg de', 'mg por', 'caps de',
];

export function detectarPerguntaDoseControlada(texto: string): string | null {
  const norm = normalizar(texto);
  if (!norm) return null;

  const temPalavraDose = PALAVRAS_DOSE.some((p) => norm.includes(normalizar(p)));
  if (!temPalavraDose) return null;

  for (const chave of Object.keys(CONTROLADOS)) {
    const chaveNorm = normalizar(chave);
    const re = new RegExp(`(?:^|\\W)${chaveNorm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\W|$)`);
    if (re.test(` ${norm} `)) return chave;
  }
  return null;
}

export function formatarRespostaDoseControlada(
  nomePaciente: string,
  substancia: string,
): string {
  const dados = CONTROLADOS[substancia];
  if (!dados) {
    return (
      `${nomePaciente}, não posso te orientar dose dessa substância. Ela não é suplemento ` +
      `alimentar comum e requer prescrição médica. Procure um médico especializado antes ` +
      `de continuar. Vou avisar seu(sua) nutri pra conversar contigo.`
    );
  }

  const riscos = RISCOS_POR_CATEGORIA[dados.categoria].map((r) => `• ${r}`).join('\n');
  const precisaCardio = dados.categoria === 'beta_agonista' || dados.categoria === 'emagrecedor';
  const precisaEndo = dados.categoria === 'anabolizante' ||
    dados.categoria === 'hormonio' ||
    dados.categoria === 'sarm';

  const redirects: string[] = [];
  if (precisaCardio) redirects.push('*cardiologista*');
  if (precisaEndo) redirects.push('*endocrinologista*');
  const blocoRedirect = redirects.length > 0
    ? `Procure ${redirects.join(' + ')} antes de continuar.`
    : 'Procure um médico especializado antes de continuar.';

  return (
    `${nomePaciente}, *não posso te passar dose de ${substancia}*.\n\n` +
    `Não é suplemento alimentar — é ${dados.motivo}. Nutricionista não prescreve ` +
    `medicamento (CFN Resolução 656/2020), e essa substância não tem aprovação ANVISA ` +
    `pra uso humano corriqueiro.\n\n` +
    `*Riscos documentados:*\n${riscos}\n\n` +
    `${blocoRedirect}\n\n` +
    `Vou sinalizar essa conversa pro seu(sua) nutri saber e orientar você com segurança.`
  );
}
