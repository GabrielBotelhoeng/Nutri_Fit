import { describe, it, expect } from 'vitest';
import { analisarSuplementos, formatarAvisoControlados } from '../src/services/suplementos';

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
});
