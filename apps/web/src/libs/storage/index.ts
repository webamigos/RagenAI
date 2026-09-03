/**
 * apps/web's binding of the shared storage abstraction (ADR-27).
 *
 * The implementations live in `@ragenai/storage` — this file exists only to
 * route the local-in-production warning through the app's own logger, so that
 * every import site keeps working unchanged.
 */
import {
  getStorageProvider as getSharedStorageProvider,
  type StorageProvider,
} from '@ragenai/storage';
import { logger } from '@/app/lib/utils/logger';

export type { StorageProvider } from '@ragenai/storage';
export { StorageNotFoundError } from '@ragenai/storage';

export function getStorageProvider(): StorageProvider {
  return getSharedStorageProvider((message) => logger.warn(message));
}
