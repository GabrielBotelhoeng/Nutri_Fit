import { describe, it, vi } from 'vitest';
import { rodarCenario, contem, tudo } from '../lib/cenario';

vi.mock('../../src/services/evolution', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('../lib/conversa')).evolutionMock,
}));

describe('Registro de refeição', () => {
  it('refeição completa por texto entra no banco com kcal plausível', async () => {
    await rodarCenario({
      id: '01a-registro-texto',
      titulo: 'Registro de refeição por texto (com quantidades)',
      criteriosJuiz:
        'O paciente informou quantidades de tudo. O bot deve registrar SEM fazer pergunta extra e mostrar kcal/macros ' +
        'coerentes (150g arroz + 100g feijão + 120g frango grelhado ≈ 450–550 kcal).',
      roteiro: async ({ paciente, checar }) => {
        const r = await paciente.enviar('almocei 150g de arroz, 100g de feijão e 120g de frango grelhado');
        const refeicoes = await paciente.refeicoes();
        const saldo = await paciente.saldoHoje();
        checar('Bot respondeu', r.length > 0);
        checar('1 refeição gravada', refeicoes.length === 1, `gravadas: ${refeicoes.length}`);
        const kcal = refeicoes[0]?.kcal ?? 0;
        checar('kcal plausível (350–650)', kcal >= 350 && kcal <= 650, `kcal=${kcal}`);
        checar('Saldo do dia somou a refeição', Math.round(saldo.kcal) === Math.round(kcal), `saldo=${saldo.kcal} refeição=${kcal}`);
        checar('Resposta mostra as kcal registradas', contem(r, new RegExp(String(Math.round(kcal)))), tudo(r).slice(0, 120));
      },
    });
  });
  it('refeição sem quantidade: bot pergunta e registra depois da resposta', async () => {
    await rodarCenario({
      id: '01b-sem-quantidade',
      titulo: 'Refeição sem quantidade (bot deve perguntar)',
      criteriosJuiz:
        'O paciente não disse quantidades. O bot deve perguntar de forma clara (de preferência com referência caseira, ' +
        'ex.: colheres/conchas) e registrar depois da resposta, sem duplicar a refeição.',
      roteiro: async ({ paciente, checar }) => {
        const r1 = await paciente.enviar('jantei arroz com feijão e bife');
        const antes = await paciente.refeicoes();
        checar('Não registrou antes de saber a quantidade', antes.length === 0, `gravadas=${antes.length}`);
        checar('Fez uma pergunta', contem(r1, /\?/), tudo(r1).slice(0, 160));
        await paciente.enviar('4 colheres de arroz, 1 concha de feijão e um bife médio');
        // Pode haver mais de uma pergunta (um item por vez); responde "estima" até registrar.
        for (let i = 0; i < 3 && (await paciente.refeicoes()).length === 0; i++) {
          await paciente.enviar('pode estimar');
        }
        const depois = await paciente.refeicoes();
        checar('Registrou depois das respostas', depois.length >= 1, `gravadas=${depois.length}`);
        const kcal = depois.reduce((s, x) => s + x.kcal, 0);
        checar('kcal plausível (400–900)', kcal >= 400 && kcal <= 900, `kcal=${kcal}`);
      },
    });
  });

  it('várias refeições numa mensagem só', async () => {
    await rodarCenario({
      id: '01c-multiplas',
      titulo: 'Várias refeições numa mensagem',
      criteriosJuiz: 'Duas refeições distintas numa mensagem. O bot deve registrar as duas, sem misturar itens entre elas.',
      roteiro: async ({ paciente, checar }) => {
        await paciente.enviar('hoje no café comi 2 ovos mexidos e 1 pão francês, e no almoço 200g de arroz com 150g de frango');
        for (let i = 0; i < 2 && (await paciente.refeicoes()).length === 0; i++) await paciente.enviar('pode estimar');
        const ref = await paciente.refeicoes();
        const saldo = await paciente.saldoHoje();
        const kcal = ref.reduce((s, x) => s + x.kcal, 0);
        checar('Registrou as 2 refeições', ref.length === 2, `gravadas=${ref.length}: ${ref.map((r) => r.descricao).join(' | ')}`);
        checar('Total plausível (750–1200 kcal)', kcal >= 750 && kcal <= 1200, `kcal=${kcal}`);
        checar('Saldo do dia = soma das refeições', Math.round(saldo.kcal) === Math.round(kcal), `saldo=${saldo.kcal} soma=${kcal}`);
      },
    });
  });

  it('correção da última refeição substitui, não soma', async () => {
    await rodarCenario({
      id: '01d-correcao',
      titulo: 'Correção da última refeição',
      criteriosJuiz: 'O paciente corrige a quantidade de arroz. Deve haver 1 refeição só, com kcal menor, e o saldo do dia igual a ela.',
      roteiro: async ({ paciente, checar }) => {
        await paciente.enviar('almocei 300g de arroz e 100g de frango grelhado');
        const [antes] = await paciente.refeicoes();
        await paciente.enviar('na verdade foram 150g de arroz');
        const ref = await paciente.refeicoes();
        const saldo = await paciente.saldoHoje();
        checar('Continua 1 refeição (não duplicou)', ref.length === 1, `gravadas=${ref.length}`);
        checar('kcal diminuiu após a correção', !!antes && ref[0]?.kcal < antes.kcal, `antes=${antes?.kcal} depois=${ref[0]?.kcal}`);
        checar('Saldo do dia = refeição corrigida', Math.round(saldo.kcal) === Math.round(ref[0]?.kcal ?? -1), `saldo=${saldo.kcal}`);
      },
    });
  });

  it('"esqueci de adicionar" soma ao dia, não substitui', async () => {
    await rodarCenario({
      id: '01e-esqueci',
      titulo: '"Esqueci de adicionar" soma',
      criteriosJuiz: 'O paciente esqueceu um item. O total do dia deve AUMENTAR — a refeição original não pode perder macros.',
      roteiro: async ({ paciente, checar }) => {
        await paciente.enviar('almocei 150g de arroz e 100g de feijão');
        const kcalAntes = (await paciente.saldoHoje()).kcal;
        await paciente.enviar('esqueci de adicionar 1 ovo frito');
        for (let i = 0; i < 2 && (await paciente.saldoHoje()).kcal <= kcalAntes; i++) await paciente.enviar('pode estimar');
        const kcalDepois = (await paciente.saldoHoje()).kcal;
        checar('Total do dia aumentou ~ovo frito (+60 a +150)', kcalDepois - kcalAntes >= 60 && kcalDepois - kcalAntes <= 150, `antes=${kcalAntes} depois=${kcalDepois}`);
      },
    });
  });
});
