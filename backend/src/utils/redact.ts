// Mascara PII em logs (LGPD). Prefere sempre id/uuid nos logs;
// use estas funcoes quando o telefone/nome for indispensavel para debug.

export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return '<null>';
  const s = String(phone);
  if (s.length < 6) return '****';
  return `${s.slice(0, 4)}****${s.slice(-2)}`;
}

export function redactName(name: string | null | undefined): string {
  if (!name) return '<null>';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '****';
  return parts.map((p) => (p[0] ?? '') + '.').join(' ');
}
