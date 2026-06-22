/**
 * Smoke programatico do mapeamento entrevista -> alertas_config (Fatia 2 #4).
 * Testa montarAlertasConfigPayload pura (sem rede) cobrindo:
 *   - 5 horarios completos (cafe + 2 lanches + almoco + jantar)
 *   - 3 horarios padrao (cafe/almoco/jantar)
 *   - 2 horarios (so cafe + jantar) — minimo aceito pela entrevista
 *   - Vazio (defesa)
 *
 * Executar no container:
 *   docker exec nutrichat_backend npx tsx scripts/smoke-alertas-config.ts
 */
import {
  montarAlertasConfigPayload,
  REFEICOES_KEYS,
  type RefeicaoKey,
  type AlertasConfigPayload,
} from '../src/services/alertas';

interface Caso {
  label: string;
  pacienteId: string;
  horarios: Record<string, string>;
  esperado: Partial<AlertasConfigPayload> & {
    aguaLen: number;
  };
}

const CASOS: Caso[] = [
  {
    label: '5 horarios completos (entrevista cheia)',
    pacienteId: 'uuid-paciente-A',
    horarios: {
      cafe: '07:00',
      lanche_manha: '10:00',
      almoco: '12:30',
      lanche_tarde: '16:00',
      jantar: '19:30',
    },
    esperado: {
      horario_cafe: '07:00',
      horario_lanche_manha: '10:00',
      horario_almoco: '12:30',
      horario_lanche_tarde: '16:00',
      horario_jantar: '19:30',
      ativo: true,
      aguaLen: 5,
    },
  },
  {
    label: '3 horarios padrao',
    pacienteId: 'uuid-paciente-B',
    horarios: { cafe: '08:00', almoco: '13:00', jantar: '20:00' },
    esperado: {
      horario_cafe: '08:00',
      horario_lanche_manha: null,
      horario_almoco: '13:00',
      horario_lanche_tarde: null,
      horario_jantar: '20:00',
      ativo: true,
      aguaLen: 3,
    },
  },
  {
    label: '2 horarios (minimo aceito) — so cafe + jantar',
    pacienteId: 'uuid-paciente-C',
    horarios: { cafe: '06:30', jantar: '21:00' },
    esperado: {
      horario_cafe: '06:30',
      horario_lanche_manha: null,
      horario_almoco: null,
      horario_lanche_tarde: null,
      horario_jantar: '21:00',
      ativo: true,
      aguaLen: 2,
    },
  },
  {
    label: 'Vazio (defesa) — payload com todos nulls + agua vazia',
    pacienteId: 'uuid-paciente-D',
    horarios: {},
    esperado: {
      horario_cafe: null,
      horario_lanche_manha: null,
      horario_almoco: null,
      horario_lanche_tarde: null,
      horario_jantar: null,
      ativo: true,
      aguaLen: 0,
    },
  },
];

function runCaso(c: Caso): { ok: boolean; erros: string[] } {
  console.log('━'.repeat(78));
  console.log(`CASO: ${c.label}`);
  console.log('━'.repeat(78));

  const payload = montarAlertasConfigPayload(c.pacienteId, c.horarios);
  console.log(`[OUT] ${JSON.stringify(payload, null, 2)}`);

  const erros: string[] = [];
  if (payload.paciente_id !== c.pacienteId) erros.push(`paciente_id mismatch`);
  if (payload.ativo !== c.esperado.ativo) erros.push(`ativo != ${c.esperado.ativo}`);
  if (payload.horarios_agua.length !== c.esperado.aguaLen) {
    erros.push(`horarios_agua.length=${payload.horarios_agua.length} esperado ${c.esperado.aguaLen}`);
  }

  const colKeys: Array<keyof AlertasConfigPayload> = [
    'horario_cafe',
    'horario_lanche_manha',
    'horario_almoco',
    'horario_lanche_tarde',
    'horario_jantar',
  ];
  for (const k of colKeys) {
    const exp = (c.esperado as Record<string, unknown>)[k as string];
    const got = payload[k];
    if (exp !== got) erros.push(`${String(k)}: got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
  }

  // Conferir: horarios_agua deve conter EXATAMENTE os horarios cadastrados (ordem da REFEICOES_KEYS)
  const horariosEsperados: string[] = [];
  for (const k of REFEICOES_KEYS as readonly RefeicaoKey[]) {
    const hora = c.horarios[k];
    if (typeof hora === 'string' && hora.length > 0) horariosEsperados.push(hora);
  }
  if (JSON.stringify(payload.horarios_agua) !== JSON.stringify(horariosEsperados)) {
    erros.push(`horarios_agua=${JSON.stringify(payload.horarios_agua)} esperado=${JSON.stringify(horariosEsperados)}`);
  }

  if (erros.length > 0) {
    console.log(`❌ ${erros.join(' | ')}`);
    return { ok: false, erros };
  }
  console.log(`✅ OK`);
  return { ok: true, erros: [] };
}

(async () => {
  let ok = 0;
  for (const c of CASOS) {
    const r = runCaso(c);
    if (r.ok) ok++;
    console.log('');
  }
  console.log('═'.repeat(78));
  console.log(`RESUMO: ${ok}/${CASOS.length} casos passaram`);
  console.log('═'.repeat(78));
  process.exit(ok === CASOS.length ? 0 : 1);
})().catch((err) => {
  console.error('FATAL no smoke:', err);
  process.exit(2);
});
