// Espelho dos tipos de backend/src/services/adesao.ts.
export type MotivoAtencao = 'sem_registro_48h' | 'baixa_adesao';
export type TendenciaPeso = 'subiu' | 'desceu' | 'estavel';

export interface ResumoAdesao {
  dias_com_registro_7d: number;
  ultimo_registro_em: string | null;
  peso_atual_kg: number | null;
  peso_tendencia: TendenciaPeso | null;
  precisa_atencao: boolean;
  motivo: MotivoAtencao | null;
}

export interface DiaAdesao {
  data: string;
  kcal: number;
  proteina_g: number;
  agua_ml: number;
}

export interface FichaAdesao {
  metas: { kcal: number; proteina_g: number; agua_ml: number | null };
  dias: DiaAdesao[];
  pesagens: { data: string; peso_kg: number }[];
  peso_inicial_kg: number | null;
  resumo: ResumoAdesao;
}

export const MOTIVO_LABEL: Record<MotivoAtencao, string> = {
  sem_registro_48h: 'Sem registrar há 2 dias ou mais',
  baixa_adesao: 'Registrou 2 dias ou menos na semana',
};

export const SETA_TENDENCIA: Record<TendenciaPeso, string> = { desceu: '↓', subiu: '↑', estavel: '→' };

export function formatarKg(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

// Dias de calendário no fuso do navegador (o nutricionista está no Brasil).
export function formatarUltimoRegistro(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const meiaNoite = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((meiaNoite(agora) - meiaNoite(d)) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

// "2026-11-03" → "03/11"
export function formatarDiaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
