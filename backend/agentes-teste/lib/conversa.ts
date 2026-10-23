// Paciente de teste: cria no Supabase local, conversa com o agente de verdade
// (processarMensagem + Claude real) e lê o que ficou gravado no banco.
//
// O envio de WhatsApp é interceptado: cada arquivo de cenário faz
//   vi.mock('../../src/services/evolution', () => evolutionMock)
// e as respostas do bot caem em `caixaDeSaida`, separadas por telefone.
import { createClient } from '@supabase/supabase-js';

export const caixaDeSaida = new Map<string, string[]>();

export const evolutionMock = {
  sendText: async (telefone: string, texto: string) => {
    const lista = caixaDeSaida.get(telefone) ?? [];
    lista.push(texto);
    caixaDeSaida.set(telefone, lista);
  },
};

export type Turno = { de: 'paciente' | 'bot'; texto: string };

const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// Faixa 5599900… — DDD 99 inexistente; nunca colide com número real.
let seq = 0;
function telefoneFicticio(): string {
  seq += 1;
  const sufixo = `${Date.now() % 100000}${seq}`.padStart(6, '0').slice(-6);
  return `5599900${sufixo}`;
}

// Entrevista já concluída: pula o onboarding nos cenários de uso diário.
export const DADOS_ENTREVISTA_PADRAO = {
  objetivo: 'emagrecimento',
  sexo: 'feminino',
  idade: 34,
  peso_kg: 72,
  altura_cm: 165,
  nivel_atividade: 'moderado',
  restricoes: [],
  preferencias_recusas: [],
  suplementos: [],
  horarios_refeicoes: { cafe: '07:30', almoco: '12:30', jantar: '20:00' },
  tmb_kcal: 1440,
  tdee_kcal: 2230,
  hidratacao_ml: 2520,
  creatina_g: 0,
  metas_kcal: 1780,
  metas_proteina_g: 130,
  metas_carbo_g: 180,
  metas_gordura_g: 60,
};

export class PacienteTeste {
  readonly telefone = telefoneFicticio();
  readonly transcricao: Turno[] = [];
  id = '';

  constructor(
    readonly nome: string,
    private readonly opcoes: { entrevistaConcluida?: boolean; dados?: Record<string, unknown> } = {},
  ) {}

  async criar(): Promise<this> {
    const expira = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const concluida = this.opcoes.entrevistaConcluida ?? true;
    const { data, error } = await db()
      .from('pacientes')
      .insert({
        nome: this.nome,
        whatsapp: this.telefone,
        plano: '3meses',
        data_expiracao: expira,
        entrevista_status: concluida ? 'completa' : 'pendente',
        entrevista_etapa: concluida ? 14 : 0,
        entrevista_dados: concluida ? { ...DADOS_ENTREVISTA_PADRAO, ...this.opcoes.dados } : {},
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Falha ao criar paciente de teste: ${error?.message}`);
    this.id = data.id as string;
    return this;
  }

  // Envia uma mensagem e devolve o que o bot respondeu a ELA.
  async enviar(texto: string): Promise<string[]> {
    const { processarMensagem } = await import('../../src/services/agent');
    const antes = caixaDeSaida.get(this.telefone)?.length ?? 0;
    this.transcricao.push({ de: 'paciente', texto });
    await processarMensagem(this.telefone, texto);
    const respostas = (caixaDeSaida.get(this.telefone) ?? []).slice(antes);
    for (const r of respostas) this.transcricao.push({ de: 'bot', texto: r });
    return respostas;
  }

  async estado() {
    const { data } = await db()
      .from('pacientes')
      .select('entrevista_status, entrevista_etapa, entrevista_dados')
      .eq('id', this.id)
      .single();
    return data as { entrevista_status: string; entrevista_etapa: number; entrevista_dados: Record<string, unknown> };
  }

  async refeicoes() {
    const { data } = await db()
      .from('refeicoes')
      .select('id, descricao, kcal, proteina_g, carbo_g, gordura_g, tipo_registro')
      .eq('paciente_id', this.id)
      .order('registrado_em');
    return (data ?? []) as { id: string; descricao: string; kcal: number; proteina_g: number; carbo_g: number; gordura_g: number }[];
  }

  async saldoHoje() {
    const { data } = await db()
      .from('registros_diarios')
      .select('kcal_consumido, proteina_g, carbo_g, gordura_g, agua_ml')
      .eq('paciente_id', this.id)
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle();
    const d = (data ?? {}) as Record<string, number>;
    return {
      kcal: Number(d.kcal_consumido ?? 0),
      proteina_g: Number(d.proteina_g ?? 0),
      carbo_g: Number(d.carbo_g ?? 0),
      gordura_g: Number(d.gordura_g ?? 0),
      agua_ml: Number(d.agua_ml ?? 0),
    };
  }

  // Remove o paciente; as demais tabelas apagam em cascata (FK ON DELETE CASCADE).
  async apagar() {
    if (this.id) await db().from('pacientes').delete().eq('id', this.id);
  }
}
