// Datas "de calendario" do paciente. O backend roda em UTC (Docker), mas o
// dia nutricional vira a meia-noite LOCAL do paciente — usando toISOString()
// (UTC), jantar depois das 21h no Brasil (UTC-3) caia em registros_diarios
// do dia SEGUINTE: o saldo do dia "virava" as 21h, quebrando saldo, streak,
// agua e relatorio semanal. Todo codigo que precisa de "hoje" como data de
// calendario do paciente DEVE usar hojeLocal(), nunca toISOString().slice().
//
// Single-tenant Brasil por enquanto; quando houver paciente fora do fuso,
// promover TIMEZONE_PACIENTES a coluna por paciente.
export const TIMEZONE_PACIENTES = process.env['TIMEZONE_PACIENTES'] || 'America/Sao_Paulo';

// en-CA formata como YYYY-MM-DD — mesmo formato das colunas DATE do Postgres.
const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE_PACIENTES,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function hojeLocal(): string {
  return formatador.format(new Date());
}

// Aritmetica de calendario sobre strings YYYY-MM-DD (independente de fuso:
// ancora em meia-noite UTC so pra somar dias sem risco de DST).
export function somarDias(dataISO: string, n: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diaAnterior(dataISO: string): string {
  return somarDias(dataISO, -1);
}

export function diasAtrasLocal(n: number): string {
  return somarDias(hojeLocal(), -n);
}
