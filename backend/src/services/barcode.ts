import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

export interface ProdutoBarcode {
  nome: string;
  macrosPor100g: {
    kcal: number;
    proteina_g: number;
    carbo_g: number;
    gordura_g: number;
  };
}

interface OffNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
}

interface OffResponse {
  status: 0 | 1;
  product?: {
    product_name?: string;
    product_name_pt?: string;
    generic_name?: string;
    generic_name_pt?: string;
    brands?: string;
    nutriments?: OffNutriments;
  };
}

// Open Food Facts costuma colocar a marca-mãe (fabricante) no inicio do
// product_name — usuario reportou "Coca-Cola Brasil Cristal" como nome da
// agua mineral. Heuristica para deixar o nome focado no produto:
//   1. Preferir product_name_pt (BR) sobre product_name (generico).
//   2. Strip primeira marca de `brands` (separada por ',') se ela aparece
//      como prefixo do nome. Comparacao normaliza hifens, espacos extras
//      e case ("Coca-Cola" casa com "Coca Cola"). So aplica se sobrar
//      substantivo (>=3 chars com letra).
//   3. Se o strip funcionou e generic_name existe e nao redunda com a
//      marca, prefixar para enriquecer ("Agua Mineral Cristal").
// Se nao funcionar nada, mantem o nome original — nunca regride.
function formatarNomeProduto(p: NonNullable<OffResponse['product']>, barcode: string): string {
  const nome = (p.product_name_pt ?? p.product_name ?? '').trim();
  if (!nome) return `Produto ${barcode}`;

  const norm = (s: string) => s.toLowerCase().replace(/[-\s]+/g, ' ').trim();
  const primeiraMarca = (p.brands ?? '').split(',')[0].trim();
  const marcaNorm = norm(primeiraMarca);

  let limpo = nome;
  let stripAplicado = false;
  if (marcaNorm.length >= 3) {
    const nomeNorm = norm(nome);
    if (nomeNorm.startsWith(marcaNorm + ' ')) {
      // Conta tokens da marca pra remover N primeiras palavras do nome original
      const nTokens = marcaNorm.split(' ').length;
      const candidato = nome.split(/\s+/).slice(nTokens).join(' ').trim();
      // So aceita strip se sobrar pelo menos uma palavra com 4+ letras alfa
      // (evita reduzir "Coca Cola LT 350ml" a "LT 350ml" — sem substantivo real).
      if (/[a-zA-ZÀ-ÿ]{4,}/.test(candidato)) {
        limpo = candidato;
        stripAplicado = true;
      }
    }
  }

  if (stripAplicado) {
    const generic = (p.generic_name_pt ?? p.generic_name ?? '').trim();
    if (generic && !norm(generic).includes(marcaNorm) && !norm(generic).includes(norm(limpo))) {
      return `${generic} ${limpo}`;
    }
  }
  return limpo;
}

export async function extrairCodigoViaVision(base64: string, mimetype: string): Promise<string | null> {
  const mimeClean = mimetype.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeClean, data: base64 } },
        { type: 'text', text: 'Leia o código de barras (EAN-13 ou similar) nesta imagem. Responda APENAS com o número do código, sem espaços ou traços. Se não conseguir ler, responda "null".' },
      ],
    }],
  });
  const texto = response.content[0].type === 'text' ? response.content[0].text.trim() : 'null';
  return texto === 'null' || texto === '' ? null : texto.replace(/\D/g, '');
}

export async function buscarOpenFoodFacts(barcode: string): Promise<ProdutoBarcode | null> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'NutriChat/1.0 (botelhog45@gmail.com)' },
    });
    if (!response.ok) return null;

    const data = await response.json() as OffResponse;
    if (data.status !== 1 || !data.product?.nutriments) return null;

    const n = data.product.nutriments;
    return {
      nome: formatarNomeProduto(data.product, barcode),
      macrosPor100g: {
        kcal:       n['energy-kcal_100g'] ?? 0,
        proteina_g: n.proteins_100g ?? 0,
        carbo_g:    n.carbohydrates_100g ?? 0,
        gordura_g:  n.fat_100g ?? 0,
      },
    };
  } catch (err) {
    console.error('[barcode] Erro ao buscar Open Food Facts:', err);
    return null;
  }
}

// Extrai código de barras via Vision e busca nutrientes no Open Food Facts.
// Retorna null se não encontrar produto — vision.ts faz fallback para leitura de rótulo.
export async function processarCodigoBarras(
  base64: string,
  mimetype: string,
): Promise<ProdutoBarcode | null> {
  const codigo = await extrairCodigoViaVision(base64, mimetype);
  if (!codigo) {
    console.log('[barcode] Não conseguiu extrair código de barras da imagem');
    return null;
  }

  console.log(`[barcode] Código extraído: ${codigo}`);
  const produto = await buscarOpenFoodFacts(codigo);

  if (!produto) {
    console.log(`[barcode] Produto ${codigo} não encontrado no OFF — fallback para leitura de rótulo`);
  }

  return produto;
}
