/**
 * Manual Jest mock for @qdrant/js-client-rest.
 *
 * qdrant.ts uses `await import('@qdrant/js-client-rest')` (a dynamic import)
 * inside its `getClient()` lazy initialiser. With ts-jest and module:node16,
 * dynamic imports are not downcompiled to require(), so vi.mock() factories
 * cannot intercept them. This moduleNameMapper redirect resolves that by
 * providing a synchronously-loadable mock module that tests can configure
 * via vi.fn() on the exported QdrantClient constructor.
 */

export const mockQdrantInstance = {
  collectionExists: vi.fn().mockResolvedValue({ exists: true }),
  createCollection: vi.fn().mockResolvedValue(undefined),
  createPayloadIndex: vi.fn().mockResolvedValue(undefined),
  upsert: vi.fn().mockResolvedValue(undefined),
};

export const QdrantClient = jest
  .fn()
  .mockImplementation(() => mockQdrantInstance);
