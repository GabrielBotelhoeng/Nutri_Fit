import { describe, it, vi } from 'vitest';
import { rodarCenario } from '../lib/cenario';
import { proximaFalaDaPersona } from '../lib/llm';

vi.mock('../../src/services/evolution', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('../lib/conversa')).evolutionMock,
}));

// Sem roteiro: a persona usa o bot à vontade por alguns turnos; o juiz avalia tudo.
// É aqui que aparecem os bugs que ninguém pensou em testar.
async function conversaLivre(paciente: import('../lib/conversa').PacienteTeste, persona: string, objetivo: string, turnos: number) {
  for (let i = 0; i < turnos; i++) {
    const fala = await proximaFalaDaPersona(persona, objetivo, paciente.transcricao);
    if (fala === 'FIM') break;
    await paciente.enviar(fala);
  }
}

describe('Conversa livre com paciente simulado', () => {
  it('Carlos — um dia de uso bagunçado', async () => {
    await rodarCenario({
      id: '05a-livre-carlos',
      titulo: 'Livre: Carlos registra o dia de forma bagunçada',
      nome: 'Carlos',
      criteriosJuiz:
        'Compare o que o paciente disse que comeu/bebeu com o que ficou no banco: faltou algo? duplicou? ' +
        'água entrou como refeição? Os totais que o bot informou batem com o banco? Alguma resposta ignorou o que foi perguntado?',
      roteiro: async ({ paciente }) => {
        await conversaLivre(
          paciente,
          'Carlos, 38 anos, motorista de aplicativo, come na rua. Manda mensagens curtas, sem pontuação, às vezes junta comida e água ' +
            'na mesma mensagem, às vezes esquece a quantidade, às vezes corrige depois ("pera, era 2 coxinhas").',
          'Registrar o que comeu e bebeu hoje (café, almoço na rua, lanche, água) e no fim perguntar como está o dia dele.',
          9,
        );
      },
    });
  });

  it('Beatriz — curiosa, muitas perguntas', async () => {
    await rodarCenario({
      id: '05b-livre-beatriz',
      titulo: 'Livre: Beatriz faz muitas perguntas',
      nome: 'Beatriz',
      criteriosJuiz:
        'Avalie se cada pergunta foi respondida de verdade, com informação correta e segura, sem inventar ' +
        'detalhes da dieta (ela não tem PDF cadastrado) e sem registrar refeição quando era só pergunta.',
      roteiro: async ({ paciente }) => {
        await conversaLivre(
          paciente,
          'Beatriz, 26 anos, estudante de enfermagem, vegetariana, curiosa. Faz perguntas sobre proteína vegetal, ' +
            'quantas calorias tem certos alimentos, se pode trocar um alimento por outro, e se creatina engorda.',
          'Tirar dúvidas de nutrição com o bot (não registrar refeição).',
          7,
        );
      },
    });
  });
});
