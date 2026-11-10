import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resultado = { data: unknown; error: null | { message: string } };

const { resultados } = vi.hoisted(() => ({ resultados: {} as Record<string, Resultado> }));

vi.mock('@supabase/supabase-js', () => {
  function chainPara(chave: string) {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gt', 'gte', 'lte', 'order', 'limit']) chain[m] = () => chain;
    const res = () => resultados[chave] ?? { data: [], error: null };
    chain.maybeSingle = () => Promise.resolve(res());
    chain.then = (resolve: (v: unknown) => unknown) => resolve(res());
    return chain;
  }
  return {
    createClient: vi.fn(() => ({
      from: (t: string) => chainPara(t),
      rpc: (fn: string) => chainPara(`rpc:${fn}`),
    })),
  };
});

import { carregarAdesaoLista, obterFichaAdesao } from '../src/services/adesao';
import { hojeLocal, somarDias } from '../src/utils/datas';

const ULTIMA = 'rpc:ultima_refeicao_por_paciente';
const hoje = hojeLocal();
const horasAtras = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString();

beforeEach(() => {
  for (const k of Object.keys(resultados)) delete resultados[k];
});

describe('carregarAdesaoLista', () => {
  const pacientes = [
    { id: 'p1', created_at: horasAtras(24 * 30), expirado: false, peso_inicial_kg: 80 },
    { id: 'p2', created_at: horasAtras(24 * 30), expirado: false, peso_inicial_kg: null },
  ];

  it('monta o resumo de cada paciente a partir das 3 fontes', async () => {
    resultados.registros_diarios = {
      data: [
        { paciente_id: 'p1', data: somarDias(hoje, -1) },
        { paciente_id: 'p1', data: somarDias(hoje, -2) },
        { paciente_id: 'p1', data: somarDias(hoje, -3) },
      ],
      error: null,
    };
    resultados[ULTIMA] = { data: [{ paciente_id: 'p1', ultima: horasAtras(3) }], error: null };
    resultados.pesagens = {
      data: [
        { paciente_id: 'p1', data: somarDias(hoje, -8), peso_kg: '79.00' },
        { paciente_id: 'p1', data: somarDias(hoje, -1), peso_kg: '78.40' },
      ],
      error: null,
    };

    const mapa = await carregarAdesaoLista(pacientes);
    expect(mapa).not.toBeNull();
    expect(mapa!.get('p1')).toMatchObject({
      dias_com_registro_7d: 3,
      peso_atual_kg: 78.4,
      peso_tendencia: 'desceu',
      precisa_atencao: false,
    });
    expect(mapa!.get('p2')).toMatchObject({
      dias_com_registro_7d: 0,
      ultimo_registro_em: null,
      precisa_atencao: true,
      motivo: 'sem_registro_48h',
    });
  });

  it('falha em qualquer fonte devolve null (lista segue sem adesão)', async () => {
    resultados[ULTIMA] = { data: null, error: { message: 'function does not exist' } };
    expect(await carregarAdesaoLista(pacientes)).toBeNull();
  });

  it('lista vazia devolve mapa vazio', async () => {
    const mapa = await carregarAdesaoLista([]);
    expect(mapa?.size).toBe(0);
  });
});

describe('obterFichaAdesao', () => {
  const paciente = {
    id: 'p1',
    created_at: horasAtras(24 * 30),
    ativo: true,
    data_expiracao: somarDias(hoje, 30),
    entrevista_dados: {
      metas_kcal: 2000, metas_proteina_g: 150, metas_carbo_g: 200, metas_gordura_g: 60,
      hidratacao_ml: 2500, peso_kg: 82.5,
    },
  };

  it('paciente inexistente devolve null', async () => {
    resultados.pacientes = { data: null, error: null };
    expect(await obterFichaAdesao('nao-existe')).toBeNull();
  });

  it('14 dias com zeros nos vazios, metas e peso inicial', async () => {
    resultados.pacientes = { data: paciente, error: null };
    resultados.registros_diarios = {
      data: [
        { data: somarDias(hoje, -1), kcal_consumido: '1850.00', proteina_g: '120.00', agua_ml: 2000 },
        { data: hoje, kcal_consumido: '600.00', proteina_g: '40.00', agua_ml: 500 },
      ],
      error: null,
    };
    resultados[ULTIMA] = { data: [{ paciente_id: 'p1', ultima: horasAtras(2) }], error: null };
    resultados.pesagens = { data: [{ data: somarDias(hoje, -1), peso_kg: '81.10' }], error: null };

    const ficha = await obterFichaAdesao('p1');
    expect(ficha).not.toBeNull();
    expect(ficha!.dias).toHaveLength(14);
    expect(ficha!.dias[0]).toEqual({ data: somarDias(hoje, -13), kcal: 0, proteina_g: 0, agua_ml: 0 });
    expect(ficha!.dias[12]).toEqual({ data: somarDias(hoje, -1), kcal: 1850, proteina_g: 120, agua_ml: 2000 });
    expect(ficha!.dias[13].data).toBe(hoje);
    expect(ficha!.metas).toEqual({ kcal: 2000, proteina_g: 150, agua_ml: 2500 });
    expect(ficha!.peso_inicial_kg).toBe(82.5);
    expect(ficha!.pesagens).toEqual([{ data: somarDias(hoje, -1), peso_kg: 81.1 }]);
    expect(ficha!.resumo.dias_com_registro_7d).toBe(1);
    expect(ficha!.resumo.peso_tendencia).toBe('desceu');
  });

  it('sem registros nem pesagens e sem metas na entrevista', async () => {
    resultados.pacientes = { data: { ...paciente, entrevista_dados: null }, error: null };
    const ficha = await obterFichaAdesao('p1');
    expect(ficha!.dias.every((d) => d.kcal === 0 && d.agua_ml === 0)).toBe(true);
    expect(ficha!.metas.kcal).toBeGreaterThan(0); // obterMetas cai no TDEE padrão
    expect(ficha!.metas.agua_ml).toBeNull();
    expect(ficha!.peso_inicial_kg).toBeNull();
    expect(ficha!.pesagens).toEqual([]);
  });

  it('erro de banco lança', async () => {
    resultados.pacientes = { data: null, error: { message: 'boom' } };
    await expect(obterFichaAdesao('p1')).rejects.toThrow('boom');
  });
});
