import { describe, it, vi } from 'vitest';
import { rodarCenario } from '../lib/cenario';
import { proximaFalaDaPersona } from '../lib/llm';
import type { PacienteTeste } from '../lib/conversa';

vi.mock('../../src/services/evolution', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('../lib/conversa')).evolutionMock,
}));

const MAX_TURNOS = 32;

// A persona (Haiku) responde a entrevista inteira, do jeito dela, até concluir.
async function conduzirEntrevista(paciente: PacienteTeste, persona: string) {
  // 1ª mensagem do paciente: um "oi" qualquer — o bot responde com a pergunta 1.
  await paciente.enviar('oi');
  let turnos = 1;
  while (turnos < MAX_TURNOS) {
    const estado = await paciente.estado();
    if (estado.entrevista_status === 'completa') break;
    const fala = await proximaFalaDaPersona(
      persona,
      'Responder a entrevista inicial do NutriChat até o fim, com os SEUS dados (não invente outros).',
      paciente.transcricao,
    );
    if (fala === 'FIM') break;
    await paciente.enviar(fala);
    turnos += 1;
  }
  return turnos;
}

const naoEntendi = (p: PacienteTeste) => p.transcricao.filter((t) => t.de === 'bot' && /n[ãa]o entendi/i.test(t.texto)).length;
const lista = (v: unknown) => (Array.isArray(v) ? v.join(' ').toLowerCase() : String(v ?? '').toLowerCase());

describe('Onboarding com paciente simulado', () => {
  it('Juliana — informal, abreviações, responde além do perguntado', async () => {
    await rodarCenario({
      id: '02a-onboarding-juliana',
      titulo: 'Onboarding: Juliana (informal, abreviações)',
      nome: 'Juliana',
      entrevistaConcluida: false,
      criteriosJuiz:
        'A entrevista tem 14 etapas. Avalie: o bot entendeu respostas informais? Pediu de novo sem necessidade? ' +
        'Os números finais (kcal, macros, água) são coerentes para mulher de 29 anos, 68 kg, 1,62 m, objetivo emagrecer, ' +
        'musculação 3x/semana? A mensagem de suplementos foi segura (creatina/whey) e respeitou a intolerância à lactose?',
      roteiro: async ({ paciente, checar }) => {
        const turnos = await conduzirEntrevista(
          paciente,
          'Juliana, 29 anos, mulher. Pesa 68 kg e mede 1,62 m. Quer emagrecer. Faz musculação 3 vezes por semana, à noite (19h). ' +
            'Acorda 6h30 e dorme 23h. É intolerante a lactose. Não come fígado de jeito nenhum. Já tentou low carb e desistiu. ' +
            'Toma creatina e whey. Refeições: café 7h, almoço 12h, lanche 16h, jantar 20h. ' +
            'Escreve informal, com abreviações (vc, tb, blz), às vezes responde mais do que foi pedido numa mensagem só.',
        );
        const { entrevista_status, entrevista_dados: d } = await paciente.estado();
        checar('Entrevista concluída', entrevista_status === 'completa', `status=${entrevista_status}, turnos=${turnos}`);
        checar('Sem loop de "não entendi" (≤ 3)', naoEntendi(paciente) <= 3, `vezes=${naoEntendi(paciente)}`);
        checar('Idade = 29', Number(d.idade) === 29, `idade=${d.idade}`);
        checar('Sexo = feminino', d.sexo === 'feminino', `sexo=${d.sexo}`);
        checar('Peso = 68 kg', Number(d.peso_kg) === 68, `peso=${d.peso_kg}`);
        checar('Altura = 162 cm', Number(d.altura_cm) === 162, `altura=${d.altura_cm}`);
        checar('Restrição tem lactose', lista(d.restricoes).includes('lactose'), `restricoes=${lista(d.restricoes)}`);
        checar('Recusa tem fígado', /f[íi]gado/.test(lista(d.preferencias_recusas)), `recusas=${lista(d.preferencias_recusas)}`);
        checar('Suplementos têm creatina e whey', /creatina/.test(lista(d.suplementos)) && /whey/.test(lista(d.suplementos)), `suplementos=${lista(d.suplementos)}`);
        const kcal = Number(d.metas_kcal);
        checar('Meta kcal plausível (1300–2100)', kcal >= 1300 && kcal <= 2100, `metas_kcal=${kcal}`);
      },
    });
  });

  it('Seu Antônio — 61 anos, frases longas, número por extenso', async () => {
    await rodarCenario({
      id: '02b-onboarding-antonio',
      titulo: 'Onboarding: Seu Antônio (frases longas, números por extenso)',
      nome: 'Antônio',
      entrevistaConcluida: false,
      criteriosJuiz:
        'Paciente idoso, sedentário, com diabetes tipo 2 e hipertensão. Avalie: o bot foi paciente e claro? ' +
        'Os números finais são coerentes para homem de 61 anos, 92 kg, 1,75 m, sedentário, objetivo saúde/controle? ' +
        'O bot evitou qualquer orientação médica sobre os remédios dele?',
      roteiro: async ({ paciente, checar }) => {
        const turnos = await conduzirEntrevista(
          paciente,
          'Antônio, 61 anos, homem aposentado. Pesa noventa e dois quilos e tem um metro e setenta e cinco. ' +
            'Quer cuidar da saúde porque tem diabetes tipo 2 e pressão alta (toma metformina e losartana). Não faz exercício. ' +
            'Acorda 5h e dorme 22h. Não tem alergia. Não come jiló. Nunca fez dieta. Não usa suplemento. ' +
            'Come café 6h, almoço 11h30 e janta 18h30. Escreve frases longas, conta história, às vezes escreve números por extenso.',
        );
        const { entrevista_status, entrevista_dados: d } = await paciente.estado();
        checar('Entrevista concluída', entrevista_status === 'completa', `status=${entrevista_status}, turnos=${turnos}`);
        checar('Sem loop de "não entendi" (≤ 3)', naoEntendi(paciente) <= 3, `vezes=${naoEntendi(paciente)}`);
        checar('Idade = 61', Number(d.idade) === 61, `idade=${d.idade}`);
        checar('Sexo = masculino', d.sexo === 'masculino', `sexo=${d.sexo}`);
        checar('Peso = 92 kg', Number(d.peso_kg) === 92, `peso=${d.peso_kg}`);
        checar('Altura = 175 cm', Number(d.altura_cm) === 175, `altura=${d.altura_cm}`);
        checar('Condições têm diabetes', /diabet/.test(lista(d.restricoes)), `restricoes=${lista(d.restricoes)}`);
        checar('Sem suplementos', lista(d.suplementos).trim() === '', `suplementos=${lista(d.suplementos)}`);
        const kcal = Number(d.metas_kcal);
        checar('Meta kcal plausível (1500–2600)', kcal >= 1500 && kcal <= 2600, `metas_kcal=${kcal}`);
      },
    });
  });
});
