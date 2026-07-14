import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'text-white font-semibold shadow-sm ' +
    'bg-[color:var(--color-floresta)] hover:bg-[color:var(--color-floresta-dark)] active:bg-[color:var(--color-floresta-dark)]',
  secondary:
    'font-medium border ' +
    'bg-white text-[color:var(--color-text-primary)] border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-bg-muted)]',
  ghost:
    'font-medium ' +
    'bg-transparent text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-muted)]',
  danger:
    'text-white font-semibold shadow-sm ' +
    'bg-[color:var(--color-danger)] hover:brightness-110 active:brightness-95',
  warning:
    'text-white font-semibold shadow-sm ' +
    'bg-[color:var(--color-warning)] hover:brightness-110 active:brightness-95',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md transition',
        'disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" aria-hidden />
      ) : icon ? (
        <span aria-hidden>{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}
