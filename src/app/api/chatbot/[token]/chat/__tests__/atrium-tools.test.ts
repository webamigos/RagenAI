import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueryRaw = vi.fn();

vi.mock('@/libs/db', () => ({
  default: { $queryRaw: mockQueryRaw },
}));

const { searchStairsHandler } = await import('../atrium-tools');

describe('searchStairsHandler', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('returns matching products for valid params', async () => {
    const rows = [
      {
        name: 'ATRIUM Mini Plus Lux 11el Dąb',
        sku: 'M11+O',
        wood_type: 'oak',
        color: 'Czarne',
        min_height_cm: 222,
        max_height_cm: 300,
        opening_width_mm: 700,
        opening_length_mm: 1500,
        image_url: 'https://atriumsystem.eu/CAPL/5907710650745-1.jpg',
        shop_url: 'https://atriumshop.eu/schody-atrium-mini-plus-p-4.html',
      },
    ];
    mockQueryRaw.mockResolvedValueOnce(rows);

    const result = await searchStairsHandler({
      height_cm: 260,
      opening_width_cm: 70,
      opening_length_cm: 150,
      wood_type: 'oak',
    });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('ATRIUM Mini Plus Lux 11el Dąb');
    expect(result.products[0].shop_url).toBe(
      'https://atriumshop.eu/schody-atrium-mini-plus-p-4.html',
    );
  });

  it('returns empty array and Polish message when no products match', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await searchStairsHandler({
      height_cm: 400,
      opening_width_cm: 70,
      opening_length_cm: 150,
    });

    expect(result.products).toHaveLength(0);
    expect(result.message).toMatch(/nie znaleziono/i);
  });

  it('passes wood_type value to query when provided', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await searchStairsHandler({
      height_cm: 260,
      opening_width_cm: 70,
      opening_length_cm: 150,
      wood_type: 'beech',
    });

    // Prisma $queryRaw tagged template: call[0] is the TemplateStringsArray (Sql object),
    // remaining args are bound values. Verify 'beech' was passed as a bound parameter.
    const allArgs = mockQueryRaw.mock.calls[0];
    const boundValues = allArgs.slice(1);
    expect(boundValues).toContain('beech');
  });

  it('converts opening dimensions from cm to mm before querying', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await searchStairsHandler({
      height_cm: 260,
      opening_width_cm: 70,
      opening_length_cm: 150,
    });

    // Verify the actual bound values passed to $queryRaw contain mm values
    const allArgs = mockQueryRaw.mock.calls[0];
    const boundValues = allArgs.slice(1);
    expect(boundValues).toContain(700); // 70cm * 10 = 700mm
    expect(boundValues).toContain(1500); // 150cm * 10 = 1500mm
  });

  it('returns unavailable message when database query fails', async () => {
    mockQueryRaw.mockRejectedValueOnce(
      new Error('relation "atrium_products" does not exist'),
    );

    const result = await searchStairsHandler({
      height_cm: 260,
      opening_width_cm: 70,
      opening_length_cm: 150,
    });

    expect(result.products).toHaveLength(0);
    expect(result.message).toMatch(/niedostępny/i);
  });
});
