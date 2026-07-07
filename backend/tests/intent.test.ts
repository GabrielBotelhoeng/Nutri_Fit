import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do SDK ANTES de importar intent.ts — o intent.ts instancia o Anthropic
// no top-level e nao queremos rede de verdade. O `haikuCreateSpy` permite
// configurar o retorno por teste e checar quantas vezes foi chamado (zero quando
// o fast-path resolve).
const { haikuCreateSpy } = vi.hoisted(() => ({
  haikuCreateSpy: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: haikuCreateSpy };
  },
}));

import {
  classificarIntencaoRapida,
  classificarIntencao,
  mencionaAguaCombinada,
  removerMencaoAgua,
} from '../src/services/intent';

beforeEach(() => {
  haikuCreateSpy.mockReset();
});

function haikuRetorna(intent: string) {
  haikuCreateSpy.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify({ intent }) }],
  });
}

describe('classificarIntencaoRapida — fast-path regex', () => {
  // Casos-bug que o P1-3 precisa resolver
  it('"bebi 300ml de suco" NAO cai em agua (suco e calorico)', () => {
    expect(classificarIntencaoRapida('bebi 300ml de suco')).toBe('registrar');
  });

  it('"bebi 250ml de leite" cai em registrar (leite tem kcal)', () => {
    expect(classificarIntencaoRapida('bebi 250ml de leite')).toBe('registrar');
  });

  it('"tomei 1 copo de coca cola" cai em registrar (coca normal e calorica)', () => {
    expect(classificarIntencaoRapida('tomei 1 copo de coca cola')).toBe('registrar');
  });

  it('"qual e minha dieta?" cai em consulta (pergunta clara)', () => {
    expect(classificarIntencaoRapida('qual é minha dieta?')).toBe('consulta');
  });

  it('"comi bem hoje, qual minha dieta?" defer pro Haiku (ambiguo)', () => {
    // Tem "comi" (verbo) E "?" — o fast-path nao tem certeza, defere
    expect(classificarIntencaoRapida('comi bem hoje, qual minha dieta?')).toBeNull();
  });

  it('"como tomar a creatina?" defer pro Haiku (como pode ser verbo OU interrogativo)', () => {
    // Apos adicionar "como" no VERBO_REGISTRO_RE (pra capturar "Como 100g de frango"),
    // perguntas com "como" + "?" viram ambiguas no fast-path e sao resolvidas pelo Haiku.
    expect(classificarIntencaoRapida('como tomar a creatina?')).toBeNull();
  });

  // Casos diretos de registro
  it('"comi 200g de frango com arroz" cai em registrar', () => {
    expect(classificarIntencaoRapida('comi 200g de frango com arroz')).toBe('registrar');
  });

  it('"Como 100g de frango com 400ml de água" cai em registrar (presente do indicativo)', () => {
    // Bug encontrado no UAT real: "Como" maiusculo + acento na "água" caia em agua.
    expect(classificarIntencaoRapida('Como 100g de frango com 400ml de água')).toBe('registrar');
  });

  it('"almocei 150g de arroz" cai em registrar', () => {
    expect(classificarIntencaoRapida('almocei 150g de arroz')).toBe('registrar');
  });

  // Casos de agua
  it('"bebi 500ml de agua" cai em agua', () => {
    expect(classificarIntencaoRapida('bebi 500ml de agua')).toBe('agua');
  });

  it('"tomei 2 copos d\'agua" cai em agua', () => {
    expect(classificarIntencaoRapida("tomei 2 copos d'agua")).toBe('agua');
  });

  it('"500ml de hidratacao" cai em agua', () => {
    expect(classificarIntencaoRapida('500ml de hidratacao')).toBe('agua');
  });

  it('"comi 200g de frango com 500ml de agua" cai em registrar (NAO agua)', () => {
    // Bug encontrado no UAT: mensagem combinada estava virando agua e perdendo
    // o registro da comida. A agua deve ser detectada por mencionaAguaCombinada.
    expect(classificarIntencaoRapida('comi 200g de frango com 500ml de agua')).toBe('registrar');
  });

  it('"almocei 150g de arroz com 2 copos de agua" cai em registrar', () => {
    expect(classificarIntencaoRapida('almocei 150g de arroz com 2 copos de agua')).toBe('registrar');
  });

  // Casos de correcao
  it('"na verdade foram 150g" cai em corrigir', () => {
    expect(classificarIntencaoRapida('na verdade foram 150g')).toBe('corrigir');
  });

  it('"esqueci de falar do feijao" cai em corrigir', () => {
    expect(classificarIntencaoRapida('esqueci de falar do feijao')).toBe('corrigir');
  });

  it('"corrige ai: foi arroz integral" cai em corrigir', () => {
    expect(classificarIntencaoRapida('corrige ai: foi arroz integral')).toBe('corrigir');
  });

  it('correcao tem prioridade sobre registro ("esqueci de falar dos 100g de feijao")', () => {
    expect(classificarIntencaoRapida('esqueci de falar dos 100g de feijao')).toBe('corrigir');
  });

  // Casos de saldo do dia (bug UAT 2026-06-24)
  it('"quantas calorias eu consumi hoje?" cai em saldo (bug UAT)', () => {
    // Caso exato do UAT: estava virando consulta → RAG → Claude alucinava kcal.
    expect(classificarIntencaoRapida('quantas calorias eu consumi hoje?')).toBe('saldo');
  });

  it('"quanto comi hoje?" cai em saldo (apesar do verbo "comi")', () => {
    // Sem a regra 0 de SALDO_RE, "?" + "comi" cairia na regra 2 (defer pro Haiku).
    expect(classificarIntencaoRapida('quanto comi hoje?')).toBe('saldo');
  });

  it('"quanto consumi de proteina?" cai em saldo', () => {
    expect(classificarIntencaoRapida('quanto consumi de proteina?')).toBe('saldo');
  });

  it('"qual meu saldo do dia?" cai em saldo', () => {
    expect(classificarIntencaoRapida('qual meu saldo do dia?')).toBe('saldo');
  });

  it('"to dentro da meta?" cai em saldo', () => {
    expect(classificarIntencaoRapida('to dentro da meta?')).toBe('saldo');
  });

  it('"quanto falta pra fechar o dia?" cai em saldo', () => {
    expect(classificarIntencaoRapida('quanto falta pra fechar o dia?')).toBe('saldo');
  });

  it('"ja bati a meta?" cai em saldo', () => {
    expect(classificarIntencaoRapida('ja bati a meta?')).toBe('saldo');
  });

  it('"quantas gramas de carbo eu comi?" cai em saldo', () => {
    expect(classificarIntencaoRapida('quantas gramas de carbo eu comi?')).toBe('saldo');
  });

  it('"qual minha dieta?" continua em consulta (nao em saldo)', () => {
    // Sanity: nada em "qual minha dieta?" sugere saldo — deve cair em consulta.
    expect(classificarIntencaoRapida('qual minha dieta?')).toBe('consulta');
  });

  // Variacoes coloquiais de saldo/resumo (ampliadas em 2026-07-07)
  it('"meu dia" cai em saldo', () => {
    expect(classificarIntencaoRapida('meu dia')).toBe('saldo');
  });

  it('"cade meu dia" cai em saldo', () => {
    expect(classificarIntencaoRapida('cade meu dia')).toBe('saldo');
  });

  it('"cadê meu resumo" cai em saldo (com acento)', () => {
    expect(classificarIntencaoRapida('cadê meu resumo')).toBe('saldo');
  });

  it('"meu progresso" cai em saldo', () => {
    expect(classificarIntencaoRapida('meu progresso')).toBe('saldo');
  });

  it('"meu resumo" cai em saldo', () => {
    expect(classificarIntencaoRapida('meu resumo')).toBe('saldo');
  });

  it('"resumo do dia" cai em saldo', () => {
    expect(classificarIntencaoRapida('resumo do dia')).toBe('saldo');
  });

  it('"resumo de hoje" cai em saldo', () => {
    expect(classificarIntencaoRapida('resumo de hoje')).toBe('saldo');
  });

  it('"progresso de hoje" cai em saldo', () => {
    expect(classificarIntencaoRapida('progresso de hoje')).toBe('saldo');
  });

  it('"progresso do dia" cai em saldo', () => {
    expect(classificarIntencaoRapida('progresso do dia')).toBe('saldo');
  });

  it('"como to hoje" cai em saldo', () => {
    expect(classificarIntencaoRapida('como to hoje')).toBe('saldo');
  });

  it('"como tô hj" cai em saldo (acento + abreviacao)', () => {
    expect(classificarIntencaoRapida('como tô hj')).toBe('saldo');
  });

  it('"qual meu dia?" cai em saldo', () => {
    expect(classificarIntencaoRapida('qual meu dia?')).toBe('saldo');
  });

  it('"qual meu progresso?" cai em saldo', () => {
    expect(classificarIntencaoRapida('qual meu progresso?')).toBe('saldo');
  });

  // Falsos positivos que precisamos evitar
  it('"meu diario alimentar" NAO cai em saldo (word boundary protege)', () => {
    // "diario" comeca com "dia" mas nao e o mesmo termo — \b apos "dia" impede match
    expect(classificarIntencaoRapida('meu diario alimentar')).not.toBe('saldo');
  });

  it('"como to indo com a creatina?" NAO cai em saldo (defer pro Haiku)', () => {
    // "indo" sozinho seria saldo mas o regex exige "hoje|hj" — sobra pergunta ambigua
    expect(classificarIntencaoRapida('como to indo com a creatina?')).toBeNull();
  });

  // Casos de substituicao
  it('"posso trocar o arroz por batata?" cai em substituicao mesmo com "?"', () => {
    // "posso trocar" e marcador forte de substituicao; o "?" e retorico aqui.
    expect(classificarIntencaoRapida('posso trocar o arroz por batata?')).toBe('substituicao');
  });

  it('"nao tenho frango em casa" cai em substituicao', () => {
    expect(classificarIntencaoRapida('nao tenho frango em casa')).toBe('substituicao');
  });

  it('"tem alguma alternativa pra ovo" cai em substituicao', () => {
    expect(classificarIntencaoRapida('tem alguma alternativa pra ovo')).toBe('substituicao');
  });

  // Fast-path retorna null em casos genuinamente ambiguos (delega pro Haiku)
  it('"comi banana" sem quantidade defer pro Haiku', () => {
    expect(classificarIntencaoRapida('comi banana')).toBeNull();
  });

  it('"oi" defer pro Haiku', () => {
    expect(classificarIntencaoRapida('oi')).toBeNull();
  });

  it('texto vazio retorna null', () => {
    expect(classificarIntencaoRapida('')).toBeNull();
    expect(classificarIntencaoRapida('   ')).toBeNull();
  });
});

describe('classificarIntencao — orquestracao fast-path + Haiku', () => {
  it('quando fast-path resolve, NAO chama o Haiku', async () => {
    const r = await classificarIntencao('comi 200g de frango');
    expect(r.intent).toBe('registrar');
    expect(r.fonte).toBe('fast-path');
    expect(haikuCreateSpy).not.toHaveBeenCalled();
  });

  it('quando fast-path defer, chama o Haiku e retorna intent dele', async () => {
    haikuRetorna('consulta');
    const r = await classificarIntencao('comi bem hoje, qual minha dieta?');
    expect(r.intent).toBe('consulta');
    expect(r.fonte).toBe('haiku');
    expect(haikuCreateSpy).toHaveBeenCalledTimes(1);
  });

  it('quando Haiku retorna intent invalida, cai em consulta com fonte haiku', async () => {
    // intent='qualquer' nao e valida — o classificarIntencaoComHaiku trata e devolve 'consulta'
    haikuRetorna('qualquer');
    const r = await classificarIntencao('texto sem decisao clara');
    expect(r.intent).toBe('consulta');
    expect(r.fonte).toBe('haiku');
  });

  it('quando Haiku retorna JSON quebrado, cai em consulta com fonte haiku', async () => {
    haikuCreateSpy.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'isto nao e json' }],
    });
    const r = await classificarIntencao('algo ambiguo');
    expect(r.intent).toBe('consulta');
    expect(r.fonte).toBe('haiku');
  });

  it('quando Haiku lanca erro, cai em consulta com fonte fallback', async () => {
    haikuCreateSpy.mockRejectedValueOnce(new Error('network'));
    const r = await classificarIntencao('algo ambiguo');
    expect(r.intent).toBe('consulta');
    expect(r.fonte).toBe('fallback');
  });
});

describe('mencionaAguaCombinada — agua dentro de msg de refeicao', () => {
  it('detecta "500ml de agua" em msg combinada', () => {
    expect(mencionaAguaCombinada('comi pao com 500ml de agua')).toBe(true);
  });

  it('detecta "2 copos de agua"', () => {
    expect(mencionaAguaCombinada('almocei arroz com 2 copos de agua')).toBe(true);
  });

  it('detecta "400ml de água" COM ACENTO (\\b nao funciona em unicode)', () => {
    // Bug encontrado no UAT: \b\b antes/depois de "água" falhava porque "á" nao
    // e \w em JS. Trocamos por (?:^|\W) e (?=\W|$).
    expect(mencionaAguaCombinada('Como 100g de frango com 400ml de água')).toBe(true);
  });

  it('NAO detecta "500ml de suco" como agua combinada', () => {
    expect(mencionaAguaCombinada('comi pao com 500ml de suco')).toBe(false);
  });

  it('NAO detecta msg sem volume', () => {
    expect(mencionaAguaCombinada('comi pao com agua')).toBe(false);
  });

  it('NAO detecta msg sem agua', () => {
    expect(mencionaAguaCombinada('comi 200g de frango')).toBe(false);
  });
});

describe('removerMencaoAgua — strip de agua combinada antes do processarTextoRefeicao', () => {
  it('remove "com 400ml de água" COM ACENTO mantendo a comida', () => {
    expect(removerMencaoAgua('Como 100g de frango com 400ml de água')).toBe('Como 100g de frango');
  });

  it('remove "com 500ml de agua" mantendo a comida', () => {
    expect(removerMencaoAgua('comi 200g de frango com 500ml de agua')).toBe('comi 200g de frango');
  });

  it('remove "com 2 copos de agua"', () => {
    expect(removerMencaoAgua('almocei 150g de arroz com 2 copos de agua')).toBe(
      'almocei 150g de arroz',
    );
  });

  it('remove "+ 750ml de agua"', () => {
    expect(removerMencaoAgua('comi pao + 750ml de agua')).toBe('comi pao');
  });

  it('remove ", 500ml de agua" no meio da frase', () => {
    expect(removerMencaoAgua('almocei arroz, 500ml de agua, feijao')).toBe('almocei arroz feijao');
  });

  it('preserva mensagem sem agua', () => {
    expect(removerMencaoAgua('comi 200g de frango')).toBe('comi 200g de frango');
  });

  it('preserva "bebi 300ml de suco" (suco NAO e agua)', () => {
    expect(removerMencaoAgua('bebi 300ml de suco')).toBe('bebi 300ml de suco');
  });
});
