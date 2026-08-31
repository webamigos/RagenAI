/**
 * Manual Jest mock for @qdrant/js-client-rest.
 *
 * qdrant.ts uses `await import('@qdrant/js-client-rest')` (a dynamic import)
 * inside its `getClient()` lazy initialiser. With ts-jest and module:node16,
 * dynamic imports are not downcompiled to require(), so jest.mock() factories
 * cannot intercept them. This moduleNameMapper redirect resolves that by
 * providing a synchronously-loadable mock module that tests can configure
 * via jest.fn() on the exported QdrantClient constructor.
 */

export const mockQdrantInstance = {
  collectionExists: jest.fn().mockResolvedValue({ exists: true }),
  createCollection: jest.fn().mockResolvedValue(undefined),
  createPayloadIndex: jest.fn().mockResolvedValue(undefined),
  upsert: jest.fn().mockResolvedValue(undefined),
};

export const QdrantClient = jest
  .fn()
  .mockImplementation(() => mockQdrantInstance);
