/**
 * The worker's binding of the shared storage abstraction (ADR-27).
 *
 * Implementations live in `@ragenai/storage`; this only routes the
 * local-in-production warning through the worker's pino logger.
 */
import {
  getStorageProvider as getSharedStorageProvider,
  type StorageProvider,
} from '@ragenai/storage';
import { logger } from '../logger';

export type { StorageProvider } from '@ragenai/storage';
export { StorageNotFoundError } from '@ragenai/storage';

export function getStorageProvider(): StorageProvider {
  return getSharedStorageProvider((message) => logger.warn(message));
}
