import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

interface SummaryCardProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
}

const toneStyles: Record<Tone, { border: string; text: string; dot: string }> = {
  neutral: {
    border: 'var(--color-border-subtle)',
    text: 'var(--color-text-primary)',
    dot: 'var(--color-text-muted)',
  },
  success: {
    border: 'var(--color-success-soft)',
    text: 'var(--color-success)',
    dot: 'var(--color-success)',
  },
  warning: {
    border: 'var(--color-warning-soft)',
    text: 'var(--color-warning)',
    dot: 'var(--color-warning)',
  },
  danger: {
    border: 'var(--color-danger-soft)',
    text: 'var(--color-danger)',
    dot: 'var(--color-danger)',
  },
};

export function SummaryCard({ label, value, hint, tone = 'neutral', active, onClick, icon }: SummaryCardProps) {
  const t = toneStyles[tone];
  const clickable = !!onClick;
  const Comp: 'button' | 'div' = clickable ? 'button' : 'div';

  return (
    <Comp
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={clickable ? !!active : undefined}
      className={[
        'flex flex-col items-start gap-1 bg-white rounded-xl p-4 text-left w-full transition',
        clickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        border: `1px solid ${active ? t.dot : t.border}`,
        boxShadow: active ? '0 0 0 3px ' + t.border : 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
        {icon && <span aria-hidden style={{ color: t.dot }}>{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: t.text }}>{value}</div>
      {hint && (
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{hint}</div>
      )}
    </Comp>
  );
}
