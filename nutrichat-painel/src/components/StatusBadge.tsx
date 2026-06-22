interface StatusBadgeProps {
  status: 'ativo' | 'expirando' | 'expirado';
}

const badgeConfig = {
  ativo:     { label: 'Ativo',     classes: 'bg-green-100 text-green-800' },
  expirando: { label: 'Expirando', classes: 'bg-yellow-100 text-yellow-800' },
  expirado:  { label: 'Expirado',  classes: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, classes } = badgeConfig[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
