import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { BarraAdesao } from './AdesaoIndicadores';
import {
  formatarDiaMes,
  formatarKg,
  formatarUltimoRegistro,
  MOTIVO_LABEL,
  type DiaAdesao,
  type FichaAdesao,
} from '../lib/adesao';

interface AdesaoModalProps {
  paciente: { id: string; nome: string };
  onClose: () => void;
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; msg: string } | { tipo: 'ok'; ficha: FichaAdesao };

export function AdesaoModal({ paciente, onClose }: AdesaoModalProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelado = false;
    // setState fora do corpo síncrono do efeito (regra react-hooks).
    void Promise.resolve().then(async () => {
      try {
        const res = await apiFetch(`/api/pacientes/${paciente.id}/adesao`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`);
        }
        const ficha = (await res.json()) as FichaAdesao;
        if (!cancelado) setEstado({ tipo: 'ok', ficha });
      } catch (err) {
        console.error('[adesao] Erro ao carregar ficha:', err);
        if (!cancelado) setEstado({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro desconhecido' });
      }
    });
    return () => {
      cancelado = true;
    };
  }, [paciente.id]);

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 sm:p-4"
      style={{ background: 'rgba(35, 64, 16, 0.45)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adesao-title"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 sm:px-6 py-4 bg-white z-10"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          <div className="min-w-0">
            <h2 id="adesao-title" className="font-display text-2xl leading-tight" style={{ color: 'var(--color-floresta)' }}>
              Adesão
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
              {paciente.nome}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar (ESC)"
            className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full text-2xl cursor-pointer hover:bg-[color:var(--color-bg-muted)] transition"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ×
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 flex flex-col gap-6">
          {estado.tipo === 'carregando' && (
            <div className="h-48 rounded-2xl animate-pulse" style={{ background: 'var(--color-bg-muted)' }} aria-busy="true" />
          )}
          {estado.tipo === 'erro' && (
            <p className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>
              <strong>Não foi possível carregar a adesão.</strong> {estado.msg}
            </p>
          )}
          {estado.tipo === 'ok' && <ConteudoFicha ficha={estado.ficha} />}
        </div>
      </div>
    </div>
  );
}

function ConteudoFicha({ ficha }: { ficha: FichaAdesao }) {
  const { resumo } = ficha;
  const semRegistro = ficha.dias.every((d) => d.kcal === 0 && d.agua_ml === 0);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <BarraAdesao dias={resumo.dias_com_registro_7d} />
        <span>Último registro: <strong>{formatarUltimoRegistro(resumo.ultimo_registro_em)}</strong></span>
        {resumo.motivo && (
          <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}>
            ⚠ {MOTIVO_LABEL[resumo.motivo]}
          </span>
        )}
      </div>

      <Secao titulo="Calorias — últimos 14 dias" subtitulo={`Meta ${Math.round(ficha.metas.kcal)} kcal/dia`}>
        {semRegistro ? (
          <Vazio texto="Nenhum registro nos últimos 14 dias. Assim que o paciente mandar refeições pelo WhatsApp, elas aparecem aqui." />
        ) : (
          <GraficoKcal dias={ficha.dias} meta={ficha.metas.kcal} />
        )}
      </Secao>

      {!semRegistro && (
        <Secao titulo="Proteína e água" subtitulo="Mais escuro = mais perto da meta">
          <FaixaMeta rotulo="Proteína" dias={ficha.dias} valor={(d) => d.proteina_g} meta={ficha.metas.proteina_g} unidade="g" />
          {ficha.metas.agua_ml ? (
            <FaixaMeta rotulo="Água" dias={ficha.dias} valor={(d) => d.agua_ml} meta={ficha.metas.agua_ml} unidade="ml" />
          ) : (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>Meta de água não definida na entrevista.</p>
          )}
        </Secao>
      )}

      <Secao titulo="Peso" subtitulo="Últimos 90 dias">
        <GraficoPeso pesagens={ficha.pesagens} inicial={ficha.peso_inicial_kg} />
      </Secao>
    </>
  );
}

function Secao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 mb-2">
        <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{titulo}</h3>
        {subtitulo && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{subtitulo}</span>}
      </div>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="text-sm px-4 py-6 rounded-xl text-center" style={{ background: 'var(--color-bg-muted)', color: 'var(--color-text-muted)' }}>
      {texto}
    </p>
  );
}

// Abaixo/na meta/acima não se distingue por cor para daltônicos (validador dataviz:
// verde×laranja ΔE 1,3 em protanopia). A barra tem cor única e a linha da meta dá
// a posição; só o excesso ganha cor própria + marcador ▲ (nunca só a cor).
const ACIMA_DA_META_PCT = 110;

// Faixa de proteína/água: um tom só, mais escuro = mais perto da meta.
function opacidadePorMeta(pct: number): number {
  if (pct >= 90) return 1;
  if (pct >= 60) return 0.65;
  if (pct >= 30) return 0.4;
  return 0.2;
}

// Desenha na largura real do contêiner: com viewBox fixo o SVG encolhia no celular
// e o texto dos eixos virava ~6 px.
function useLargura(padrao: number) {
  const ref = useRef<HTMLElement | null>(null);
  const [largura, setLargura] = useState(padrao);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entrada]) => {
      const w = Math.round(entrada.contentRect.width);
      if (w > 0) setLargura(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura] as const;
}

function GraficoKcal({ dias, meta }: { dias: DiaAdesao[]; meta: number }) {
  const [ref, W] = useLargura(560);
  const H = 180;
  const topo = 12;
  const base = H - 24;
  const maxValor = Math.max(meta * 1.3, ...dias.map((d) => d.kcal), 1);
  const y = (v: number) => base - (v / maxValor) * (base - topo);
  const passo = W / dias.length;
  const largura = passo * 0.62;
  const ultimo = dias.length - 1;

  return (
    <figure ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Calorias por dia nos últimos 14 dias, comparadas à meta">
        <line x1={0} x2={W} y1={y(meta)} y2={y(meta)} stroke="var(--color-text-muted)" strokeDasharray="4 4" strokeWidth={1} />
        <text x={W - 4} y={y(meta) - 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">meta</text>
        {dias.map((d, i) => {
          const x = i * passo + (passo - largura) / 2;
          const pct = meta > 0 ? (d.kcal / meta) * 100 : 0;
          const acima = pct > ACIMA_DA_META_PCT;
          const hoje = i === ultimo;
          return (
            <g key={d.data} opacity={hoje ? 0.5 : 1}>
              <title>{`${formatarDiaMes(d.data)}${hoje ? ' (hoje, parcial)' : ''}: ${Math.round(d.kcal)} kcal (${Math.round(pct)}% da meta)`}</title>
              {/* Área de hover maior que a barra. */}
              <rect x={i * passo} y={topo} width={passo} height={base - topo} fill="transparent" />
              {d.kcal > 0 ? (
                <>
                  <rect
                    x={x}
                    y={y(d.kcal)}
                    width={largura}
                    height={base - y(d.kcal)}
                    rx={4}
                    fill={acima ? 'var(--color-warning)' : 'var(--color-medio)'}
                  />
                  {acima && (
                    <text x={x + largura / 2} y={y(d.kcal) - 3} textAnchor="middle" fontSize={10} fill="var(--color-text-secondary)">
                      ▲
                    </text>
                  )}
                </>
              ) : (
                <rect x={x} y={base - 3} width={largura} height={3} rx={1.5} fill="var(--color-border-subtle)" />
              )}
              {(i % 2 === 1 || hoje) && (
                <text x={x + largura / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
                  {hoje ? 'hoje' : formatarDiaMes(d.data)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
        <Legenda cor="var(--color-medio)" texto="kcal do dia" />
        <Legenda cor="var(--color-warning)" texto="▲ acima de 110% da meta" />
        <span>Linha tracejada = meta. Hoje aparece mais claro: o dia ainda não acabou.</span>
      </figcaption>
    </figure>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: cor }} aria-hidden />
      {texto}
    </span>
  );
}

function FaixaMeta({
  rotulo,
  dias,
  valor,
  meta,
  unidade,
}: {
  rotulo: string;
  dias: DiaAdesao[];
  valor: (d: DiaAdesao) => number;
  meta: number;
  unidade: string;
}) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <span className="w-16 shrink-0 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{rotulo}</span>
      <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
        {dias.map((d, i) => {
          const v = valor(d);
          const pct = meta > 0 ? Math.round((v / meta) * 100) : 0;
          return (
            <span
              key={d.data}
              className="h-6 rounded-sm"
              title={`${formatarDiaMes(d.data)}: ${Math.round(v)} ${unidade} (${pct}% da meta)`}
              style={{
                background: v > 0 ? 'var(--color-medio)' : 'transparent',
                border: v > 0 ? 'none' : '1px solid var(--color-border-subtle)',
                // Hoje (parcial) fica mais apagado por cima da escala.
                opacity: v > 0 ? opacidadePorMeta(pct) * (i === dias.length - 1 ? 0.6 : 1) : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function GraficoPeso({ pesagens, inicial }: { pesagens: { data: string; peso_kg: number }[]; inicial: number | null }) {
  // Antes do retorno antecipado (regra dos hooks).
  const [ref, W] = useLargura(560);
  if (pesagens.length === 0) {
    return <Vazio texto={'Sem pesagens ainda. O paciente pode mandar "pesei 78,5" no WhatsApp.'} />;
  }
  const primeiro = inicial ?? pesagens[0].peso_kg;
  const atual = pesagens[pesagens.length - 1].peso_kg;
  const delta = Math.round((atual - primeiro) * 10) / 10;
  const textoDelta = delta === 0 ? 'sem variação' : `${delta > 0 ? '+' : '−'}${formatarKg(Math.abs(delta))} kg`;
  const ultima = pesagens[pesagens.length - 1];

  const H = 140;
  const pad = 16;
  const valores = pesagens.map((p) => p.peso_kg);
  const min = Math.min(...valores, primeiro) - 0.5;
  const max = Math.max(...valores, primeiro) + 0.5;
  const t0 = new Date(pesagens[0].data).getTime();
  const t1 = new Date(pesagens[pesagens.length - 1].data).getTime();
  const x = (iso: string) => (t1 === t0 ? W / 2 : pad + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - 2 * pad));
  const y = (v: number) => pad + ((max - v) / (max - min)) * (H - 2 * pad);
  const pontos = pesagens.map((p) => `${x(p.data)},${y(p.peso_kg)}`).join(' ');

  return (
    <figure ref={ref}>
      <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        <strong className="tabular-nums">{formatarKg(primeiro)} → {formatarKg(atual)} kg</strong> ({textoDelta}
        {inicial !== null ? ' desde a entrevista' : ' no período'})
      </p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`Peso de ${formatarKg(primeiro)} para ${formatarKg(atual)} kg`}>
        {inicial !== null && (
          <>
            <line x1={0} x2={W} y1={y(inicial)} y2={y(inicial)} stroke="var(--color-border-subtle)" strokeDasharray="4 4" />
            <text x={4} y={y(inicial) - 4} fontSize={11} fill="var(--color-text-muted)">entrevista {formatarKg(inicial)}</text>
          </>
        )}
        {pesagens.length > 1 && (
          <polyline points={pontos} fill="none" stroke="var(--color-medio)" strokeWidth={2} strokeLinejoin="round" />
        )}
        {pesagens.map((p) => (
          <circle key={p.data} cx={x(p.data)} cy={y(p.peso_kg)} r={4} fill="var(--color-floresta)">
            <title>{`${formatarDiaMes(p.data)}: ${formatarKg(p.peso_kg)} kg`}</title>
          </circle>
        ))}
        {/* Rótulo direto só no ponto atual; os demais ficam no tooltip. */}
        <text
          x={x(ultima.data) - 8}
          y={y(ultima.peso_kg) - 10}
          textAnchor="end"
          fontSize={12}
          fontWeight={600}
          fill="var(--color-text-primary)"
        >
          {formatarKg(ultima.peso_kg)} kg
        </text>
      </svg>
    </figure>
  );
}
