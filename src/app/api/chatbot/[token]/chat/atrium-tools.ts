import { tool } from 'ai';
import { z } from 'zod';
import prisma from '@/libs/db';

export type StairProduct = {
  name: string;
  sku: string | null;
  wood_type: string;
  color: string;
  min_height_cm: number;
  max_height_cm: number;
  opening_width_mm: number;
  opening_length_mm: number;
  image_url: string | null;
  shop_url: string;
};

const searchStairsSchema = z.object({
  height_cm: z.number().describe('Odległość między stropami w cm (np. 260)'),
  opening_width_cm: z
    .number()
    .describe('Szerokość otworu w stropie w cm — wymiar A (np. 70)'),
  opening_length_cm: z
    .number()
    .describe('Długość otworu w stropie w cm — wymiar B (np. 150)'),
  wood_type: z
    .enum(['beech', 'oak'])
    .optional()
    .describe('Gatunek drewna: beech = buk, oak = dąb'),
});

type SearchStairsResult = {
  products: StairProduct[];
  message: string;
};

export async function searchStairsHandler(
  input: z.infer<typeof searchStairsSchema>,
): Promise<SearchStairsResult> {
  const { height_cm, opening_width_cm, opening_length_cm, wood_type } = input;

  const opening_width_mm = opening_width_cm * 10;
  const opening_length_mm = opening_length_cm * 10;

  let products: StairProduct[];
  try {
    products = await prisma.$queryRaw<StairProduct[]>`
      SELECT name, sku, wood_type, color,
             min_height_cm, max_height_cm,
             opening_width_mm, opening_length_mm,
             image_url, shop_url
      FROM atrium_products
      WHERE min_height_cm <= ${height_cm}
        AND max_height_cm >= ${height_cm}
        AND opening_width_mm <= ${opening_width_mm}
        AND opening_length_mm <= ${opening_length_mm}
        AND (
          ${wood_type ?? null}::text IS NULL
          OR wood_type = ${wood_type ?? null}
          OR wood_type = 'both'
        )
      ORDER BY opening_width_mm ASC
    `;
  } catch {
    return {
      products: [],
      message:
        'Katalog produktów jest chwilowo niedostępny. Spróbuj ponownie później.',
    };
  }

  if (products.length === 0) {
    return {
      products: [],
      message:
        'Nie znaleziono pasujących schodów dla podanych wymiarów. ' +
        'Sprawdź czy wysokość między stropami i wymiary otworu są poprawne.',
    };
  }

  return {
    products,
    message: `Znaleziono ${products.length} pasujących modeli.`,
  };
}

export function getAtriumTools() {
  return {
    search_stairs: tool<z.infer<typeof searchStairsSchema>, SearchStairsResult>(
      {
        description:
          'Wyszukuje schody ATRIUM pasujące do podanych wymiarów. ' +
          'Wywołaj w kroku 3 konfiguratora gdy znasz wysokość między stropami, ' +
          'wymiary otworu i opcjonalnie gatunek drewna.',
        inputSchema: searchStairsSchema,
        execute: searchStairsHandler,
      },
    ),
  };
}
