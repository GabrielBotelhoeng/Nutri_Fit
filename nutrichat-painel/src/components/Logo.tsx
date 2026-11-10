// Mesma marca do header da landing: círculo verde com folha + nome em serif.
interface LogoProps {
  subtitulo?: string;
  tamanho?: 'md' | 'lg';
}

function Folha({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

export function Logo({ subtitulo = 'Painel do nutricionista', tamanho = 'md' }: LogoProps) {
  const grande = tamanho === 'lg';
  const circulo = grande ? 46 : 38;
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="flex flex-shrink-0 items-center justify-center rounded-full"
        style={{
          width: circulo,
          height: circulo,
          color: 'var(--color-offwhite)',
          background: 'linear-gradient(135deg, #2D5016, #4A7C2F)',
        }}
      >
        <Folha size={grande ? 22 : 18} />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className="font-display"
          style={{ color: 'var(--color-floresta)', fontSize: grande ? 26 : 20 }}
        >
          NutriChat
        </span>
        {subtitulo && (
          <span className="mt-1 text-[11px] tracking-[0.04em]" style={{ color: 'var(--color-text-secondary)' }}>
            {subtitulo}
          </span>
        )}
      </span>
    </span>
  );
}
