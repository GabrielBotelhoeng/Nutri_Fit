import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
} as const;

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div
      className={[
        'bg-white rounded-xl',
        paddingMap[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ boxShadow: 'var(--shadow-card)', border: '1px solid var(--color-border-subtle)' }}
    >
      {children}
    </div>
  );
}
