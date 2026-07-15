interface HelpTipProps {
  text: string;
}

export function HelpTip({ text }: HelpTipProps) {
  return (
    <span
      role="img"
      aria-label={`Ajuda: ${text}`}
      title={text}
      tabIndex={0}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ml-1 cursor-help select-none"
      style={{
        background: 'var(--color-bg-muted)',
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      ?
    </span>
  );
}
