// Fonte unica de verdade dos planos no frontend. Espelha
// MESES_POR_PLANO do backend (backend/src/routes/pacientes.ts).
// Se um novo plano for adicionado, atualizar os dois lados.

export const MESES_POR_PLANO = {
  '1mes': 1,
  '3meses': 3,
  '6meses': 6,
  '12meses': 12,
} as const;

export type PlanoId = keyof typeof MESES_POR_PLANO;

export const PLANO_LABELS: Record<PlanoId, string> = {
  '1mes': '1 mes',
  '3meses': '3 meses',
  '6meses': '6 meses',
  '12meses': '12 meses',
};

export const PLANOS_ORDENADOS: PlanoId[] = ['1mes', '3meses', '6meses', '12meses'];

export function calcularDataExpiracao(plano: PlanoId, hoje = new Date()): string {
  // Trabalha em UTC pra bater com o calculo do backend e evitar off-by-one
  // por fuso. Retorna YYYY-MM-DD.
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() + MESES_POR_PLANO[plano]);
  return d.toISOString().slice(0, 10);
}

export function formatarDataBR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
