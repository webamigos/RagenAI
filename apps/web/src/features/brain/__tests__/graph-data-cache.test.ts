import { expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => vi.fn((query) => query));
vi.mock('react', () => ({ cache }));
vi.mock('@ragenai/prisma-client', () => ({ default: {} }));

it('registers the shared graph data query with React request caching', async () => {
  const { getBrainGraphDataQuery } =
    await import('../services/queries/get-brain-graph-data-query');
  expect(cache).toHaveBeenCalledOnce();
  expect(getBrainGraphDataQuery).toBe(cache.mock.results[0].value);
});
