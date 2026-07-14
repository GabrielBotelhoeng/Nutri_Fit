import { describe, it, expect } from 'vitest';
import {
  analisarSuplementos,
  calcularDoseCafeina,
  calcularDoseOmega,
  calcularDoseSuplementos,
  calcularDoseWhey,
  categorizarSeguro,
  detectarPerguntaDoseControlada,
  formatarAvisoControlados,
  formatarExplicacaoTermogenicos,
  formatarMensagemSuplementos,
  formatarRespostaDoseControlada,
} from '../src/services/suplementos';

describe('analisarSuplementos — classificacao', () => {
  it('lista vazia/undefined → todos os baldes vazios', () => {
    expect(analisarSuplementos([])).toEqual({ seguros: [], desconhecidos: [], controlados: [] });
    expect(analisarSuplementos(undefined)).toEqual({ seguros: [], desconhecidos: [], controlados: [] });
  });

  it('creatina + whey + vitamina D → seguros', () => {
    const r = analisarSuplementos(['creatina', 'whey protein', 'vitamina D']);
    expect(r.seguros).toHaveLength(3);
    expect(r.controlados).toHaveLength(0);
  });

  it('clembuterol → controlado (caso do UAT real do Gabriel)', () => {
    const r = analisarSuplementos(['creatina', 'clembuterol', 'whey protein']);
    expect(r.seguros).toHaveLength(2);
    expect(r.controlados).toHaveLength(1);
    expect(r.controlados[0].nome).toBe('clembuterol');
    expect(r.controlados[0].motivo).toMatch(/beta-agonista/i);
  });

  it('clenbuterol (variante grafia inglesa) → controlado', () => {
    const r = analisarSuplementos(['clenbuterol']);
    expect(r.controlados).toHaveLength(1);
  });

  it('stanozolol → controlado', () => {
    const r = analisarSuplementos(['stanozolol 50mg']);
    expect(r.controlados[0].motivo).toMatch(/anabolizante/i);
  });

  it('oxandrolona → controlado', () => {
    const r = analisarSuplementos(['oxandrolona']);
    expect(r.controlados).toHaveLength(1);
  });

  it('GH e hormonios → controlado', () => {
    const r = analisarSuplementos(['GH', 'somatropina']);
    expect(r.controlados).toHaveLength(2);
  });

  it('SARMs (ostarine, ligandrol) → controlado', () => {
    const r = analisarSuplementos(['ostarine', 'ligandrol']);
    expect(r.controlados).toHaveLength(2);
  });

  it('sibutramina → controlado', () => {
    const r = analisarSuplementos(['sibutramina']);
    expect(r.controlados).toHaveLength(1);
  });

  it('item nao reconhecido → desconhecido (nao controlado por falso positivo)', () => {
    const r = analisarSuplementos(['suplemento_estranho_xpto']);
    expect(r.desconhecidos).toHaveLength(1);
    expect(r.controlados).toHaveLength(0);
  });

  it('case-insensitive', () => {
    const r = analisarSuplementos(['CREATINA', 'Clembuterol', 'whey PROTEIN']);
    expect(r.seguros).toHaveLength(2);
    expect(r.controlados).toHaveLength(1);
  });

  it('com acentos ("clembuterol em cápsula") → controlado', () => {
    const r = analisarSuplementos(['clembuterol em cápsula']);
    expect(r.controlados).toHaveLength(1);
  });

  it('item com creatina+dose ("creatina 5g") → seguro', () => {
    const r = analisarSuplementos(['creatina 5g/dia']);
    expect(r.seguros).toHaveLength(1);
  });

  it('omega-3 com variacoes → seguro', () => {
    const r = analisarSuplementos(['omega 3', 'ômega-3', 'oleo de peixe']);
    expect(r.seguros).toHaveLength(3);
  });

  it('multivitaminico → seguro', () => {
    const r = analisarSuplementos(['multivitaminico', 'multivitamínico']);
    expect(r.seguros).toHaveLength(2);
  });

  it('nao confunde "testosterona" com "creatina" (substring nao quebra)', () => {
    const r = analisarSuplementos(['testosterona', 'creatina']);
    expect(r.controlados).toHaveLength(1);
    expect(r.seguros).toHaveLength(1);
  });
});

describe('formatarAvisoControlados', () => {
  it('vazio → string vazia', () => {
    expect(formatarAvisoControlados([], 'Gabriel')).toBe('');
  });

  it('1 substancia → singular, cita nome e motivo', () => {
    const msg = formatarAvisoControlados(
      [{ nome: 'clembuterol', motivo: 'beta-agonista, banido pela WADA' }],
      'Gabriel',
    );
    expect(msg).toContain('Gabriel');
    expect(msg).toContain('clembuterol');
    expect(msg).toContain('beta-agonista');
    expect(msg).toMatch(/seguinte substancia controlada/);
  });

  it('2+ substancias → plural', () => {
    const msg = formatarAvisoControlados(
      [
        { nome: 'clembuterol', motivo: 'doping' },
        { nome: 'stanozolol', motivo: 'anabolizante' },
      ],
      'Gabriel',
    );
    expect(msg).toMatch(/seguintes substancias controladas/);
  });

  it('mensagem diz que nutricionista sera notificado', () => {
    const msg = formatarAvisoControlados(
      [{ nome: 'GH', motivo: 'hormonio' }],
      'Maria',
    );
    expect(msg).toMatch(/nutricionista/i);
  });

  it('mensagem NAO recomenda parar ou trocar dose (responsabilidade do medico)', () => {
    const msg = formatarAvisoControlados(
      [{ nome: 'GH', motivo: 'hormonio' }],
      'Maria',
    );
    expect(msg).not.toMatch(/pare de usar|interrompa|reduza a dose|aumente a dose/i);
  });

  it('inclui bloco de riscos explicando o *porque*', () => {
    const msg = formatarAvisoControlados(
      [{ nome: 'clembuterol', motivo: 'beta-agonista' }],
      'Gabriel',
    );
    expect(msg).toMatch(/Por que essa preocupacao/i);
    expect(msg).toMatch(/taquicardia|arritmia/i);
  });

  it('redireciona pra cardiologista quando ha beta-agonista', () => {
    const msg = formatarAvisoControlados(
      [{ nome: 'clembuterol', motivo: 'beta-agonista' }],
      'Gabriel',
    );
    expect(msg).toMatch(/cardiologista/i);
  });

  it('redireciona pra endocrinologista quando ha anabolizante', () => {
    const msg = formatarAvisoControlados(
      [{ nome: 'stanozolol', motivo: 'anabolizante' }],
      'Gabriel',
    );
    expect(msg).toMatch(/endocrinologista/i);
  });

  it('redireciona pra ambos quando ha beta-agonista + anabolizante', () => {
    const msg = formatarAvisoControlados(
      [
        { nome: 'clembuterol', motivo: 'beta-agonista' },
        { nome: 'stanozolol', motivo: 'anabolizante' },
      ],
      'Gabriel',
    );
    expect(msg).toMatch(/cardiologista/i);
    expect(msg).toMatch(/endocrinologista/i);
  });
});

describe('categorizarSeguro', () => {
  it('whey → proteina', () => {
    expect(categorizarSeguro('whey protein')).toBe('proteina');
    expect(categorizarSeguro('whey isolado')).toBe('proteina');
    expect(categorizarSeguro('caseina')).toBe('proteina');
  });

  it('cafeina, pre-treino, cha verde → estimulante', () => {
    expect(categorizarSeguro('cafeina')).toBe('estimulante');
    expect(categorizarSeguro('pre-treino')).toBe('estimulante');
    expect(categorizarSeguro('cha verde')).toBe('estimulante');
  });

  it('omega 3, oleo de peixe → omega', () => {
    expect(categorizarSeguro('omega 3')).toBe('omega');
    expect(categorizarSeguro('oleo de peixe')).toBe('omega');
  });

  it('creatina, BCAA, vitamina D → outro', () => {
    expect(categorizarSeguro('creatina')).toBe('outro');
    expect(categorizarSeguro('bcaa')).toBe('outro');
    expect(categorizarSeguro('vitamina d')).toBe('outro');
  });

  it('nao reconhecido → null', () => {
    expect(categorizarSeguro('produto_x')).toBeNull();
  });
});

describe('calcularDoseWhey', () => {
  it('80kg → ~24g de proteina (1 scoop)', () => {
    const s = calcularDoseWhey(80);
    expect(s.dose).toMatch(/24g/);
    expect(s.dose).toMatch(/1 scoop/);
    expect(s.categoria).toBe('proteina');
  });

  it('100kg → ~30g / 1 scoop', () => {
    const s = calcularDoseWhey(100);
    expect(s.dose).toMatch(/30g/);
  });

  it('timing menciona pos-treino', () => {
    expect(calcularDoseWhey(70).timing).toMatch(/pos-treino/i);
  });
});

describe('calcularDoseCafeina', () => {
  it('80kg → 240 mg (3 mg/kg)', () => {
    expect(calcularDoseCafeina(80).dose).toMatch(/240 mg/);
  });

  it('teto 400 mg (150 kg cairia em 450, capped)', () => {
    expect(calcularDoseCafeina(150).dose).toMatch(/400 mg/);
  });

  it('cautela menciona nao usar apos 16h', () => {
    expect(calcularDoseCafeina(70).cautela).toMatch(/16h/);
  });
});

describe('calcularDoseOmega', () => {
  it('dose fixa 1-2g EPA+DHA', () => {
    const s = calcularDoseOmega();
    expect(s.dose).toMatch(/1-2g/);
    expect(s.dose).toMatch(/EPA/);
  });
});

describe('calcularDoseSuplementos', () => {
  it('whey + creatina → 1 sugestao (whey) + creatina em outros', () => {
    const r = calcularDoseSuplementos(80, ['whey protein', 'creatina']);
    expect(r.comCalculo).toHaveLength(1);
    expect(r.comCalculo[0].categoria).toBe('proteina');
    expect(r.outrosInformados).toContain('creatina');
  });

  it('whey + cafeina + omega-3 → 3 sugestoes com calculo', () => {
    const r = calcularDoseSuplementos(80, ['whey', 'cafeina', 'omega 3']);
    expect(r.comCalculo).toHaveLength(3);
    const cats = r.comCalculo.map((c) => c.categoria).sort();
    expect(cats).toEqual(['estimulante', 'omega', 'proteina']);
  });

  it('whey + whey isolado (mesma categoria) → dedup, 1 sugestao', () => {
    const r = calcularDoseSuplementos(80, ['whey', 'whey isolado']);
    expect(r.comCalculo).toHaveLength(1);
  });

  it('so vitaminas → nenhum calculo, tudo em outros', () => {
    const r = calcularDoseSuplementos(80, ['vitamina d', 'multivitaminico']);
    expect(r.comCalculo).toHaveLength(0);
    expect(r.outrosInformados).toHaveLength(2);
  });
});

describe('formatarMensagemSuplementos', () => {
  it('vazio → string vazia', () => {
    expect(formatarMensagemSuplementos([], [])).toBe('');
  });

  it('inclui dose, timing e cautela pra cada sugestao', () => {
    const msg = formatarMensagemSuplementos([calcularDoseWhey(80)], []);
    expect(msg).toMatch(/Whey Protein/);
    expect(msg).toMatch(/Dose sugerida/);
    expect(msg).toMatch(/Quando/);
    expect(msg).toMatch(/Cuidado/);
  });

  it('lista outros informados como "tambem anotei"', () => {
    const msg = formatarMensagemSuplementos([], ['creatina', 'vitamina d']);
    expect(msg).toMatch(/Tambem anotei/i);
    expect(msg).toMatch(/creatina/);
    expect(msg).toMatch(/vitamina d/);
  });

  it('sempre lembra que e sugestao inicial, nutri valida', () => {
    const msg = formatarMensagemSuplementos([calcularDoseWhey(80)], []);
    expect(msg).toMatch(/nutricionista|nutri/i);
  });
});

describe('formatarExplicacaoTermogenicos', () => {
  it('sem estimulante → vazio (nao spamma quem so toma whey)', () => {
    const s = calcularDoseWhey(80);
    expect(formatarExplicacaoTermogenicos([s])).toBe('');
  });

  it('com cafeina → menciona efeitos e cautelas', () => {
    const msg = formatarExplicacaoTermogenicos([calcularDoseCafeina(80)]);
    expect(msg).toMatch(/Termogenicos/i);
    expect(msg).toMatch(/taquicardia|batimento/i);
    expect(msg).toMatch(/16h/);
  });

  it('alerta quando ha condicao pre-existente', () => {
    const msg = formatarExplicacaoTermogenicos([calcularDoseCafeina(80)]);
    expect(msg).toMatch(/hipertensao|arritmia/i);
  });
});

describe('detectarPerguntaDoseControlada', () => {
  it('"quanto de clembuterol eu tomo?" → detecta clembuterol', () => {
    expect(detectarPerguntaDoseControlada('quanto de clembuterol eu tomo?')).toBe('clembuterol');
  });

  it('"como faco ciclo de ostarine?" → detecta ostarine', () => {
    expect(detectarPerguntaDoseControlada('como faco ciclo de ostarine?')).toBe('ostarine');
  });

  it('"posso tomar 2ml de clembuterol?" → detecta clembuterol', () => {
    expect(detectarPerguntaDoseControlada('posso tomar 2ml de clembuterol?')).toBe('clembuterol');
  });

  it('"que dose de stanozolol?" → detecta', () => {
    expect(detectarPerguntaDoseControlada('que dose de stanozolol?')).toBe('stanozolol');
  });

  it('"posso tomar whey?" → null (whey nao e controlado)', () => {
    expect(detectarPerguntaDoseControlada('posso tomar whey?')).toBeNull();
  });

  it('"o que e clembuterol?" (sem palavra de dose) → null', () => {
    // paciente perguntando o QUE e cai no RAG normal, nao no redirect
    expect(detectarPerguntaDoseControlada('o que e clembuterol?')).toBeNull();
  });

  it('texto vazio → null', () => {
    expect(detectarPerguntaDoseControlada('')).toBeNull();
  });
});

describe('formatarRespostaDoseControlada', () => {
  it('clembuterol → nome, riscos, redirect cardio', () => {
    const msg = formatarRespostaDoseControlada('Gabriel', 'clembuterol');
    expect(msg).toMatch(/Gabriel/);
    expect(msg).toMatch(/nao posso te passar dose/i);
    expect(msg).toMatch(/clembuterol/);
    expect(msg).toMatch(/cardiologista/);
    expect(msg).toMatch(/taquicardia|arritmia/i);
  });

  it('stanozolol → redirect endocrinologista', () => {
    const msg = formatarRespostaDoseControlada('Gabriel', 'stanozolol');
    expect(msg).toMatch(/endocrinologista/);
  });

  it('NAO passa dose em hipotese alguma', () => {
    const msg = formatarRespostaDoseControlada('Gabriel', 'clembuterol');
    expect(msg).not.toMatch(/\d+\s*ml\b|\d+\s*mg\b/i);
    expect(msg).not.toMatch(/comece com|inicie com|1ml|2ml|1mg/i);
  });

  it('menciona CFN 656/2020 pra justificar', () => {
    const msg = formatarRespostaDoseControlada('Gabriel', 'clembuterol');
    expect(msg).toMatch(/CFN.*656/i);
  });

  it('substancia desconhecida → resposta generica sem falhar', () => {
    const msg = formatarRespostaDoseControlada('Gabriel', 'substancia_x');
    expect(msg).toMatch(/nao posso/i);
    expect(msg).toMatch(/medico/i);
  });
});
