import { LocalStorageProvider, DEFAULT_LOCAL_PATH } from './local-provider';
import { S3StorageProvider } from './s3-provider';
import type { StorageProvider, StorageProviderName } from './types';

export type { StorageProvider, StorageProviderName } from './types';
export { StorageNotFoundError } from './errors';
export { LocalStorageProvider, DEFAULT_LOCAL_PATH } from './local-provider';
export { S3StorageProvider } from './s3-provider';

/**
 * Default provider. `local` since ADR-27 — Ragen is self-hosted software, so a
 * fresh clone has to run without a cloud account. S3 is opt-in.
 */
export const DEFAULT_STORAGE_PROVIDER: StorageProviderName = 'local';

export function resolveStorageProviderName(
  raw = process.env.STORAGE_PROVIDER,
): StorageProviderName {
  const name = raw?.trim() || DEFAULT_STORAGE_PROVIDER;
  if (name !== 's3' && name !== 'local') {
    throw new Error(
      `Unknown STORAGE_PROVIDER: "${name}". Supported values: "s3", "local".`,
    );
  }
  return name;
}

/**
 * Local storage is correct for a single-node self-hosted install and wrong the
 * moment there is a second replica: the worker writes a file the app cannot
 * see, because they no longer share a filesystem. Uploads appear to succeed and
 * downloads 404 later, which is a miserable thing to debug from the symptom.
 *
 * Warn rather than throw — single-node production is a supported configuration
 * for self-hosted software and refusing to boot would break it. Name the actual
 * failure mode, not "not recommended".
 */
function warnIfLocalInProduction(
  name: StorageProviderName,
  warn: (message: string) => void,
): void {
  const env = process.env.TARGET_ENV;
  if (name !== 'local' || (env !== 'production' && env !== 'staging')) {
    return;
  }
  warn(
    `STORAGE_PROVIDER is "local" while TARGET_ENV is "${env}". Files are written to ` +
      `${process.env.STORAGE_LOCAL_PATH || DEFAULT_LOCAL_PATH} on this machine's disk. ` +
      `That is fine for a single-node deployment sharing one volume, and broken for ` +
      `anything with more than one replica: the worker will write documents the app ` +
      `cannot read, and a container restart loses everything not on a mounted volume. ` +
      `Set STORAGE_PROVIDER=s3 for multi-replica deployments.`,
  );
}

let instance: StorageProvider | null = null;

/**
 * Process-wide singleton. `warn` is injected so each app can route the
 * production warning through its own logger; it defaults to console.warn for
 * callers that have none.
 */
export function getStorageProvider(
  warn: (message: string) => void = (message) => {
    // eslint-disable-next-line no-console
    console.warn(message);
  },
): StorageProvider {
  if (instance) {
    return instance;
  }

  const name = resolveStorageProviderName();
  warnIfLocalInProduction(name, warn);

  instance =
    name === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
  return instance;
}

/** Test seam — drops the memoized provider so env changes take effect. */
export function resetStorageProvider(): void {
  instance = null;
}
