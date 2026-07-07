import { describe, it, expect } from 'vitest';
import { hojeLocal, somarDias, diaAnterior, diasAtrasLocal, TIMEZONE_PACIENTES } from '../src/utils/datas';

describe('utils/datas — dia de calendario do paciente', () => {
  it('hojeLocal devolve YYYY-MM-DD', () => {
    expect(hojeLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('timezone default e America/Sao_Paulo', () => {
    expect(TIMEZONE_PACIENTES).toBe(process.env['TIMEZONE_PACIENTES'] || 'America/Sao_Paulo');
  });

  it('hojeLocal e coerente com o relogio no fuso configurado (nao UTC cru)', () => {
    const esperado = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE_PACIENTES, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    expect(hojeLocal()).toBe(esperado);
  });

  it('somarDias cruza mes, ano e ano bissexto corretamente', () => {
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2024-02-28', 1)).toBe('2024-02-29'); // bissexto
    expect(somarDias('2026-07-05', 0)).toBe('2026-07-05');
  });

  it('diaAnterior e atalho de somarDias(-1)', () => {
    expect(diaAnterior('2026-01-01')).toBe('2025-12-31');
  });

  it('diasAtrasLocal(0) e o proprio hoje', () => {
    expect(diasAtrasLocal(0)).toBe(hojeLocal());
    expect(diasAtrasLocal(1)).toBe(diaAnterior(hojeLocal()));
  });
});
