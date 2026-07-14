interface StatusBadgeProps {
  status: 'ativo' | 'expirando' | 'expirado';
  title?: string;
}

const badgeConfig = {
  ativo: {
    label: 'Ativo',
    bg: 'var(--color-success-soft)',
    fg: 'var(--color-success)',
    dot: '●',
  },
  expirando: {
    label: 'Expirando',
    bg: 'var(--color-warning-soft)',
    fg: 'var(--color-warning)',
    dot: '●',
  },
  expirado: {
    label: 'Expirado',
    bg: 'var(--color-danger-soft)',
    fg: 'var(--color-danger)',
    dot: '●',
  },
} as const;

export function StatusBadge({ status, title }: StatusBadgeProps) {
  const cfg = badgeConfig[status];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      <span aria-hidden style={{ fontSize: '8px' }}>{cfg.dot}</span>
      {cfg.label}
    </span>
  );
}
