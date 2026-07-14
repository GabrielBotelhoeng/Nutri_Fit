import type { RagStatus } from '../lib/rag';

const config: Record<RagStatus, { label: string; hint: string; bg: string; fg: string; icon: string }> = {
  indexado: {
    label: 'Bot pronto',
    hint: 'A dieta foi processada — o bot ja consegue responder duvidas sobre ela pelo WhatsApp.',
    bg: 'var(--color-success-soft)',
    fg: 'var(--color-success)',
    icon: '✓',
  },
  processando: {
    label: 'Preparando',
    hint: 'Extraindo texto e indexando a dieta. Costuma levar ate 5 minutos.',
    bg: 'var(--color-warning-soft)',
    fg: 'var(--color-warning)',
    icon: '⏳',
  },
  falhou: {
    label: 'Falhou — reenviar',
    hint: 'O processamento da dieta falhou. Abra a edicao do paciente e envie o PDF novamente.',
    bg: 'var(--color-danger-soft)',
    fg: 'var(--color-danger)',
    icon: '✕',
  },
  sem_dieta: {
    label: 'Sem dieta',
    hint: 'Nenhuma dieta cadastrada para este paciente.',
    bg: '#EDEEEA',
    fg: '#666B60',
    icon: '–',
  },
};

interface RagBadgeProps {
  status: RagStatus;
}

export function RagBadge({ status }: RagBadgeProps) {
  const cfg = config[status];
  return (
    <span
      title={cfg.hint}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      <span aria-hidden>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
