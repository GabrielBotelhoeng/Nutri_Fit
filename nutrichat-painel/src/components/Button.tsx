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
  primary: 'btn-cta text-[color:var(--color-offwhite)] font-semibold shadow-sm',
  secondary:
    'font-medium border ' +
    'bg-white text-[color:var(--color-floresta)] border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-bg-muted)] hover:border-[color:var(--color-menta)]',
  ghost:
    'font-medium ' +
    'bg-transparent text-[color:var(--color-medio)] hover:bg-[color:var(--color-floresta-soft)] hover:text-[color:var(--color-floresta)]',
  danger:
    'text-white font-semibold shadow-sm ' +
    'bg-[color:var(--color-danger)] hover:brightness-110 active:brightness-95',
  warning:
    'text-white font-semibold shadow-sm ' +
    'bg-[color:var(--color-warning)] hover:brightness-110 active:brightness-95',
};

const sizeStyles: Record<Size, string> = {
  sm: 'min-h-[36px] px-3 text-xs',
  md: 'min-h-[44px] px-4 text-sm',
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
        'inline-flex items-center justify-center gap-2 rounded-lg transition',
        'disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-80" aria-hidden />
      ) : icon ? (
        <span aria-hidden>{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}
