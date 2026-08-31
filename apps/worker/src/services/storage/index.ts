import type { StorageProvider } from './types';
import { S3StorageProvider } from './s3-provider';
import { LocalStorageProvider } from './local-provider';

export type { StorageProvider } from './types';

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (instance) {
    return instance;
  }

  const provider = process.env.STORAGE_PROVIDER || 's3';

  switch (provider) {
    case 's3': {
      instance = new S3StorageProvider();
      break;
    }
    case 'local': {
      instance = new LocalStorageProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER: "${provider}". Supported values: "s3", "local".`,
      );
  }

  return instance;
}
