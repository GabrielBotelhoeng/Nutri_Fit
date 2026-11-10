import { formatarKg, formatarUltimoRegistro, MOTIVO_LABEL, SETA_TENDENCIA, type ResumoAdesao } from '../lib/adesao';

const traco = <span style={{ color: 'var(--color-text-muted)' }}>—</span>;

export function BarraAdesao({ dias }: { dias: number }) {
  const cor = dias >= 5 ? 'var(--color-success)' : dias >= 3 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <span className="inline-flex items-center gap-2" title={`${dias} de 7 dias com registro`}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="w-2 h-3.5 rounded-sm"
            style={{ background: i < dias ? cor : 'var(--color-border-subtle)' }}
          />
        ))}
      </span>
      <span className="tabular-nums text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {dias}/7
      </span>
    </span>
  );
}

export function UltimoRegistro({ adesao }: { adesao: ResumoAdesao | null }) {
  if (!adesao) return traco;
  const alerta = adesao.motivo === 'sem_registro_48h';
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ color: alerta ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}
      title={adesao.motivo ? MOTIVO_LABEL[adesao.motivo] : undefined}
    >
      {formatarUltimoRegistro(adesao.ultimo_registro_em)}
      {alerta && <span aria-label="precisa de atenção">⚠</span>}
    </span>
  );
}

export function PesoResumo({ adesao }: { adesao: ResumoAdesao | null }) {
  if (!adesao || adesao.peso_atual_kg === null) return traco;
  const seta = adesao.peso_tendencia ? SETA_TENDENCIA[adesao.peso_tendencia] : '';
  return (
    <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
      {formatarKg(adesao.peso_atual_kg)} kg {seta && <span aria-hidden>{seta}</span>}
    </span>
  );
}
