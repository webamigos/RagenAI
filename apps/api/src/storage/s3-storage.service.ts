import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  getStorageProvider,
  StorageNotFoundError,
  type StorageProvider,
} from '@ragenai/storage';

/**
 * apps/api's binding of the shared storage abstraction (ADR-27).
 *
 * Previously this held its own copy of the S3 code and supported no local
 * provider at all — its own comment said "add a local variant here if apps/api
 * ever needs the same dev fallback". With `local` now the default, it needs it,
 * so the implementation moved to `@ragenai/storage` and this became a binding.
 *
 * The error translation is load-bearing, not ceremony: Nest maps its own
 * `NotFoundException` to HTTP 404, so letting the package's `StorageNotFoundError`
 * escape would turn a 404 into a 500.
 *
 * The class name is kept so existing injection sites keep resolving, even
 * though it is no longer S3-specific.
 */
@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly provider: StorageProvider;

  constructor() {
    this.provider = getStorageProvider((message) => this.logger.warn(message));
  }

  async upload(key: string, content: Buffer): Promise<void> {
    await this.provider.upload(key, content);
  }

  async download(key: string): Promise<Buffer> {
    try {
      return await this.provider.download(key);
    } catch (err) {
      throw toNestError(err);
    }
  }

  async delete(key: string): Promise<void> {
    await this.provider.delete(key);
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    try {
      await this.provider.downloadToFile(key, destPath);
    } catch (err) {
      throw toNestError(err);
    }
  }
}

function toNestError(err: unknown): unknown {
  return err instanceof StorageNotFoundError
    ? new NotFoundException(err.message)
    : err;
}
