/**
 * Smoke programatico do fim de entrevista (#3).
 * Roda 3 perfis cobrindo objetivos diferentes (emagrecer / ganhar_massa /
 * saude_geral) e com/sem restricao. Para cada um, imprime as 3 mensagens
 * que iriam pro WhatsApp e roda assertions sobre os numeros.
 *
 * Executar dentro do container:
 *   docker exec nutrichat_backend npx tsx scripts/smoke-fim-entrevista.ts
 */
import {
  calcularTMB,
  calcularHidratacao,
  calcularCreatina,
  calcularMacros,
  gerarExplicacaoPersonalizada,
  formatarMensagemCalculos,
  type DadosEntrevista,
} from '../src/services/calculos';
import type { ObjetivoNutricional } from '../src/services/conversation';

interface PerfilSmoke {
  label: string;
  nome: string;
  objetivo: ObjetivoNutricional;
  restricoes: string[];
  dados: DadosEntrevista;
}

const PERFIS: PerfilSmoke[] = [
  {
    label: 'Gabriel — homem 25, ganhar_massa, musculacao 5x',
    nome: 'Gabriel',
    objetivo: 'ganhar_massa',
    restricoes: [],
    dados: {
      idade: 25,
      sexo: 'masculino',
      peso_kg: 80,
      altura_cm: 178,
      atividade_tipo: 'musculacao',
      atividade_frequencia: '5x por semana',
      suplementos: ['whey', 'creatina'],
    },
  },
  {
    label: 'Marina — mulher 32, emagrecer, intolerancia lactose',
    nome: 'Marina',
    objetivo: 'emagrecer',
    restricoes: ['intolerancia a lactose', 'nao gosta de peixe'],
    dados: {
      idade: 32,
      sexo: 'feminino',
      peso_kg: 65,
      altura_cm: 165,
      atividade_tipo: 'caminhada',
      atividade_frequencia: '3x por semana',
      suplementos: [],
    },
  },
  {
    label: 'Carlos — homem 58, saude_geral, sedentario, creatina prescrita 3g',
    nome: 'Carlos',
    objetivo: 'saude_geral',
    restricoes: ['hipertensao'],
    dados: {
      idade: 58,
      sexo: 'masculino',
      peso_kg: 92,
      altura_cm: 175,
      atividade_tipo: 'sedentario',
      atividade_frequencia: 'nao treino',
      suplementos: ['creatina 3g'],
    },
  },
];

function prefix(texto: string, p = '│ '): string {
  return texto.split('\n').map((l) => p + l).join('\n');
}

async function smoke(perfil: PerfilSmoke): Promise<{ ok: boolean; erros: string[] }> {
  console.log('━'.repeat(78));
  console.log(`PERFIL: ${perfil.label}`);
  console.log('━'.repeat(78));

  const tmb = calcularTMB(perfil.dados);
  const hidratacao = calcularHidratacao(perfil.dados.peso_kg);
  const creatina = calcularCreatina(perfil.dados.peso_kg, perfil.dados.suplementos);
  const macros = calcularMacros(tmb.tdee_kcal, perfil.objetivo, perfil.dados.peso_kg);

  const somaPct = macros.proteina_pct + macros.carbo_pct + macros.gordura_pct;
  const kcalDoSplit = macros.proteina_g * 4 + macros.carbo_g * 4 + macros.gordura_g * 9;
  const driftKcal = Math.abs(kcalDoSplit - macros.kcal);

  console.log('');
  console.log(`[NUM] TMB=${tmb.tmb_kcal} TDEE=${tmb.tdee_kcal} (${tmb.nivel_atividade}, fator ${tmb.fator_atividade})`);
  console.log(`[NUM] Macros: ${macros.kcal} kcal | P ${macros.proteina_g}g / C ${macros.carbo_g}g / G ${macros.gordura_g}g | % ${macros.proteina_pct}/${macros.carbo_pct}/${macros.gordura_pct} (soma ${somaPct})`);
  console.log(`[NUM] Drift kcal (split vs meta): ${driftKcal} kcal`);
  console.log(`[NUM] Hidratacao: ${hidratacao.meta_ml}ml em ${hidratacao.distribuicao.length} porcoes`);
  console.log(`[NUM] Creatina: ${creatina.dose_g}g (fonte ${creatina.fonte})`);

  // ── MSG 1: numeros ─────────────────────────────────────────────────────
  console.log('\n┌─ MSG 1 (numeros) ───────────────────────────────────────────────────');
  console.log(prefix(formatarMensagemCalculos(tmb, macros, hidratacao, creatina)));
  console.log('└─────────────────────────────────────────────────────────────────────');

  // ── MSG 2: Haiku (pode falhar — try/catch isolado igual ao agent.ts) ──
  console.log('\n┌─ MSG 2 (Haiku) ─────────────────────────────────────────────────────');
  let haikuOk = false;
  let haikuLen = 0;
  let haikuErro = '';
  try {
    const t0 = Date.now();
    const explicacao = await gerarExplicacaoPersonalizada(
      { nome: perfil.nome, objetivo: perfil.objetivo, restricoes: perfil.restricoes },
      tmb,
      macros,
      hidratacao.meta_ml,
    );
    const dt = Date.now() - t0;
    haikuLen = explicacao.trim().length;
    haikuOk = haikuLen > 0;
    console.log(`│ [Haiku resposta em ${dt}ms, ${haikuLen} chars]`);
    console.log(prefix(explicacao));
  } catch (err) {
    haikuErro = err instanceof Error ? err.message : String(err);
    console.log(`│ [Haiku FALHOU — fluxo segue mesmo assim]`);
    console.log(`│ erro: ${haikuErro}`);
  }
  console.log('└─────────────────────────────────────────────────────────────────────');

  // ── MSG 3: instrucoes (copia exata de agent.ts) ───────────────────────
  const instrucoes =
    `💡 *Como usar o NutriChat:*\n\n` +
    `• _"comi 200g de frango com arroz"_ — registro por texto\n` +
    `• 🎤 Audio descrevendo sua refeicao\n` +
    `• 📸 Foto do prato ou codigo de barras\n` +
    `• _"qual e minha dieta?"_ — consulta ao PDF\n\n` +
    `Vamos la! 🚀`;
  console.log('\n┌─ MSG 3 (instrucoes) ────────────────────────────────────────────────');
  console.log(prefix(instrucoes));
  console.log('└─────────────────────────────────────────────────────────────────────');

  // ── Assertions ────────────────────────────────────────────────────────
  const erros: string[] = [];
  if (somaPct < 98 || somaPct > 102) erros.push(`soma pct fora de 100±2 (${somaPct})`);
  if (driftKcal > 30) erros.push(`drift kcal > 30 (${driftKcal})`);
  if (tmb.tdee_kcal < tmb.tmb_kcal) erros.push('TDEE < TMB');
  if (hidratacao.meta_ml !== perfil.dados.peso_kg * 35) erros.push(`hidratacao != peso*35 (${hidratacao.meta_ml} vs ${perfil.dados.peso_kg * 35})`);
  if (macros.kcal <= 0 || macros.proteina_g <= 0 || macros.carbo_g < 0 || macros.gordura_g <= 0) erros.push('macros nao positivos');

  // Sanity de objetivo: emagrecer < TDEE, ganhar_massa > TDEE
  if (perfil.objetivo === 'emagrecer' && macros.kcal >= tmb.tdee_kcal) erros.push('emagrecer com kcal >= TDEE');
  if (perfil.objetivo === 'ganhar_massa' && macros.kcal <= tmb.tdee_kcal) erros.push('ganhar_massa com kcal <= TDEE');
  if ((perfil.objetivo === 'manter' || perfil.objetivo === 'saude_geral') && macros.kcal !== tmb.tdee_kcal) erros.push(`${perfil.objetivo} com kcal != TDEE`);

  // Haiku: ok ou erro tolerado? Para o smoke do CODIGO, basta que NAO derrube o fluxo (try/catch protege)
  // Sinalizamos mas nao quebramos o smoke se Haiku falhou.
  if (!haikuOk) {
    console.log(`\n⚠️  Haiku nao retornou texto util (${haikuErro || 'resposta vazia'}) — fluxo NAO foi derrubado, mas explicacao nao chegaria ao paciente`);
  }

  console.log('');
  if (erros.length > 0) {
    console.log(`❌ ASSERCOES FALHARAM: ${erros.join(' | ')}`);
    return { ok: false, erros };
  }
  console.log(`✅ Asserções OK${haikuOk ? ' + Haiku gerou explicacao' : ' (Haiku indisponivel mas fluxo seguiu)'}`);
  return { ok: true, erros: [] };
}

(async () => {
  let okCount = 0;
  for (const p of PERFIS) {
    const r = await smoke(p);
    if (r.ok) okCount++;
    console.log('');
  }
  console.log('═'.repeat(78));
  console.log(`RESUMO: ${okCount}/${PERFIS.length} perfis passaram nas asserções`);
  console.log('═'.repeat(78));
  process.exit(okCount === PERFIS.length ? 0 : 1);
})().catch((err) => {
  console.error('FATAL no smoke:', err);
  process.exit(2);
});
