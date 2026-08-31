/**
 * Thrown when a key has no object behind it.
 *
 * The package owns this rather than importing either app's exception class:
 * ragen-app has its own `NotFoundException`, apps/api uses NestJS's, and the
 * worker had neither. Callers translate at their own boundary — apps/api in
 * particular must map this to Nest's `NotFoundException`, or a 404 becomes a
 * 500.
 */
export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`No content found for key: ${key}`);
    this.name = 'StorageNotFoundError';
  }
}
