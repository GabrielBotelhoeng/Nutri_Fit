/**
 * Smoke programatico do detector de overshoot calorico (Fatia 3 #4).
 * Testa a funcao pura `excedeuMetaKcal` cobrindo:
 *   - Saldo abaixo da meta (< 100%)
 *   - Saldo exatamente na meta (= 100%)
 *   - Saldo no limite do gatilho (= 110%)
 *   - Saldo acima do gatilho (> 110%)
 *   - Defesa: meta = 0 (sem meta cadastrada — nao alerta)
 *   - Defesa: meta negativa (corrompida — nao alerta)
 *
 * Executar no container:
 *   docker exec nutrichat_backend npx tsx scripts/smoke-overshoot.ts
 */
import { excedeuMetaKcal, OVERSHOOT_THRESHOLD, type MacrosRefeicao } from '../src/services/meal';
import type { MacrosDiarios } from '../src/services/calculos';

interface Caso {
  label: string;
  saldoKcal: number;
  metaKcal: number;
  esperado: boolean;
}

const META_BASE: Omit<MacrosDiarios, 'kcal'> = {
  proteina_g: 150,
  carbo_g: 250,
  gordura_g: 70,
  proteina_pct: 30,
  carbo_pct: 50,
  gordura_pct: 20,
};

const SALDO_BASE: Omit<MacrosRefeicao, 'kcal'> = {
  proteina_g: 0,
  carbo_g: 0,
  gordura_g: 0,
};

const CASOS: Caso[] = [
  {
    label: 'Saldo bem abaixo da meta (50%)',
    saldoKcal: 1000,
    metaKcal: 2000,
    esperado: false,
  },
  {
    label: 'Saldo exatamente na meta (100%)',
    saldoKcal: 2000,
    metaKcal: 2000,
    esperado: false,
  },
  {
    label: 'Saldo no limite do threshold (110% exato)',
    saldoKcal: 2200,
    metaKcal: 2000,
    esperado: false, // strict > — 110% nao alerta, so > 110%
  },
  {
    label: 'Saldo logo acima do threshold (110.05%)',
    saldoKcal: 2201,
    metaKcal: 2000,
    esperado: true,
  },
  {
    label: 'Saldo muito acima (150%)',
    saldoKcal: 3000,
    metaKcal: 2000,
    esperado: true,
  },
  {
    label: 'Defesa: meta = 0 (sem meta cadastrada)',
    saldoKcal: 5000,
    metaKcal: 0,
    esperado: false,
  },
  {
    label: 'Defesa: meta negativa (corrompida)',
    saldoKcal: 5000,
    metaKcal: -100,
    esperado: false,
  },
];

function runCaso(c: Caso): { ok: boolean; erros: string[] } {
  console.log('━'.repeat(78));
  console.log(`CASO: ${c.label}`);
  console.log(`      saldo=${c.saldoKcal}kcal, meta=${c.metaKcal}kcal, threshold=${OVERSHOOT_THRESHOLD * 100}%`);
  console.log('━'.repeat(78));

  const saldo: MacrosRefeicao = { ...SALDO_BASE, kcal: c.saldoKcal };
  const metas: MacrosDiarios = { ...META_BASE, kcal: c.metaKcal };

  const got = excedeuMetaKcal(saldo, metas);
  console.log(`[OUT] excedeuMetaKcal -> ${got} (esperado ${c.esperado})`);

  const erros: string[] = [];
  if (got !== c.esperado) erros.push(`got=${got} esperado=${c.esperado}`);

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
