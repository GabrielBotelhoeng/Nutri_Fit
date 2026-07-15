// Datas "de calendario" do paciente. Backend roda em UTC (Docker), mas o dia
// nutricional vira a meia-noite LOCAL — sem isso, jantar depois das 21h BR
// (UTC-3) cairia no dia seguinte no toISOString, quebrando saldo/streak/relatorio.
// Todo codigo que precisa de "hoje" do paciente DEVE usar hojeLocal(), nunca
// toISOString().slice(). Single-tenant Brasil por enquanto — quando houver
// paciente fora do fuso, promover a coluna por paciente.
export const TIMEZONE_PACIENTES = process.env['TIMEZONE_PACIENTES'] || 'America/Sao_Paulo';

// en-CA formata YYYY-MM-DD (mesmo formato das colunas DATE do Postgres).
const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE_PACIENTES,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function hojeLocal(): string {
  return formatador.format(new Date());
}

// Aritmetica sobre YYYY-MM-DD ancorada em meia-noite UTC — sem risco de DST.
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
