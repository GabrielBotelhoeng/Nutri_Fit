import { describe, it, vi } from 'vitest';
import { rodarCenario, contem, tudo } from '../lib/cenario';

vi.mock('../../src/services/evolution', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('../lib/conversa')).evolutionMock,
}));

describe('Água, saldo do dia e perguntas', () => {
  it('água por copo e "foram X copos" (regressão do bug #2)', async () => {
    await rodarCenario({
      id: '03a-agua',
      titulo: 'Água: "2 copos" e "hoje foram 3 copos" (não pode mexer no almoço)',
      criteriosJuiz: 'Os registros de água devem somar no contador de água e NUNCA alterar a refeição registrada antes.',
      roteiro: async ({ paciente, checar }) => {
        await paciente.enviar('almocei 150g de arroz e 120g de frango grelhado');
        const [almoco] = await paciente.refeicoes();
        await paciente.enviar('bebi 2 copos de água');
        const agua1 = (await paciente.saldoHoje()).agua_ml;
        checar('2 copos = 500 ml', agua1 === 500, `agua=${agua1}`);
        await paciente.enviar('hoje foram 3 copos de água');
        const agua2 = (await paciente.saldoHoje()).agua_ml;
        const [almocoDepois] = await paciente.refeicoes();
        checar('"foram 3 copos" somou 750 ml', agua2 === 1250, `agua=${agua2}`);
        checar('Almoço intacto (kcal igual)', almocoDepois?.kcal === almoco?.kcal, `antes=${almoco?.kcal} depois=${almocoDepois?.kcal}`);
        checar('Nenhuma refeição nova', (await paciente.refeicoes()).length === 1);
      },
    });
  });

  it('saldo do dia bate com o banco', async () => {
    await rodarCenario({
      id: '03b-saldo',
      titulo: 'Saldo do dia: "quanto já comi hoje?"',
      criteriosJuiz: 'O número de kcal que o bot informa tem que ser exatamente o do banco. Deve comparar com a meta (1780 kcal).',
      roteiro: async ({ paciente, checar }) => {
        await paciente.enviar('almocei 150g de arroz, 100g de feijão e 120g de frango grelhado');
        const saldo = await paciente.saldoHoje();
        const r = await paciente.enviar('quanto eu já comi hoje?');
        checar('Resposta cita as kcal do banco', contem(r, new RegExp(String(Math.round(saldo.kcal)))), `banco=${saldo.kcal} | ${tudo(r).slice(0, 160)}`);
        checar('Resposta cita a meta (1780 ou 1.780)', contem(r, /1\.?780/), tudo(r).slice(0, 160));
      },
    });
  });

  it('pergunta sobre um alimento é respondida (regressão do bug #3)', async () => {
    await rodarCenario({
      id: '03c-pergunta-alimento',
      titulo: 'Pergunta: "quantas calorias tem uma banana?"',
      criteriosJuiz:
        'O paciente perguntou sobre a banana. O bot deve responder sobre a banana (~90–110 kcal numa média) ' +
        'e NÃO devolver o resumo/progresso do dia no lugar da resposta. Também não deve registrar refeição.',
      roteiro: async ({ paciente, checar }) => {
        const r = await paciente.enviar('quantas calorias tem uma banana?');
        checar('Falou de banana', contem(r, /banana/i), tudo(r).slice(0, 160));
        checar('Não respondeu com o bloco de progresso do dia', !contem(r, /progresso|meta de hoje|saldo/i), tudo(r).slice(0, 160));
        checar('Não registrou refeição', (await paciente.refeicoes()).length === 0);
      },
    });
  });

  it('dúvida sobre a dieta (sem PDF) não inventa plano', async () => {
    await rodarCenario({
      id: '03d-duvida-dieta',
      titulo: 'Dúvida: "posso comer pão à noite?"',
      criteriosJuiz:
        'Esta paciente NÃO tem PDF de dieta cadastrado. O bot pode dar orientação geral, mas não pode inventar ' +
        'detalhes de um plano que não conhece (ex.: "sua dieta diz X"). Deve sugerir confirmar com o nutricionista quando fizer sentido.',
      roteiro: async ({ paciente, checar }) => {
        const r = await paciente.enviar('posso comer pão à noite?');
        checar('Respondeu', r.length > 0 && tudo(r).length > 20);
        checar('Não registrou refeição', (await paciente.refeicoes()).length === 0);
      },
    });
  });
});
