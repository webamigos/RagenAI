import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

import { StorageNotFoundError } from './errors';
import type { StorageProvider } from './types';

/**
 * S3 signals a missing object by *rejecting* the request, not by returning an
 * empty body, so a `!response.Body` check alone never sees it. Without this
 * normalisation the S3 provider leaks a raw AWS error where the local provider
 * raises StorageNotFoundError — the exact inconsistency ADR-27 exists to remove.
 */
function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const e = err as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e.name === 'NoSuchKey' ||
    e.name === 'NotFound' ||
    e.$metadata?.httpStatusCode === 404
  );
}

/**
 * Any S3-compatible object store: AWS S3, Cloudflare R2, Scaleway Object
 * Storage, MinIO, Ceph. `AWS_ENDPOINT_URL` points at the provider and
 * `AWS_S3_FORCE_PATH_STYLE` switches addressing style — together those are all
 * a non-AWS provider needs, which was true before ADR-27 but documented only as
 * a Scaleway quirk.
 */
function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION,
    // Accepts the spellings people actually write. apps/web used to compare
    // against '1' only, so AWS_S3_FORCE_PATH_STYLE=true silently did nothing
    // there — and a wrong addressing style shows up as TLS/404 errors that look
    // nothing like a config typo.
    forcePathStyle: /^(1|true|yes)$/i.test(
      process.env.AWS_S3_FORCE_PATH_STYLE ?? '',
    ),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  });
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = createS3Client();
    this.bucket = process.env.AWS_S3_BUCKET_NAME!;
  }

  async upload(key: string, content: Buffer): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: content },
    });
    await upload.done();
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.getObject(key);

    if (!response.Body) {
      throw new StorageNotFoundError(key);
    }

    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  private async getObject(key: string) {
    try {
      return await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      if (isNotFound(err)) {
        throw new StorageNotFoundError(key);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const response = await this.getObject(key);

    if (!response.Body) {
      throw new StorageNotFoundError(key);
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    // Streamed rather than buffered: this path exists for documents large
    // enough that holding them in memory is the problem being avoided.
    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(destPath),
    );
  }
}
