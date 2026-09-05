import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';

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
 * Storage, MinIO, Ceph. `S3_ENDPOINT_URL` points at the provider and
 * `S3_FORCE_PATH_STYLE` switches addressing style — together those are all
 * a non-AWS provider needs, which was true before ADR-27 but documented only as
 * a Scaleway quirk.
 *
 * Every var here uses an `S3_` prefix, not `AWS_`: the AWS KMS encryption
 * provider reads `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/
 * `AWS_ENDPOINT_URL`/`AWS_DEFAULT_REGION` for real AWS credentials, and
 * `infra/litellm/config.yaml`'s Bedrock entries read the two credential names
 * too — a deployment running this store against a non-AWS provider (Scaleway,
 * in every deployment today) alongside either of those would have one
 * silently clobber the other's config, not just its credentials: KMS would
 * try to reach Scaleway's endpoint/region as if it were AWS's.
 * See docs/adrs/27-storage-abstraction-local-by-default.md's Update section.
 */
function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT_URL,
    region: process.env.S3_REGION,
    // Accepts the spellings people actually write. apps/web used to compare
    // against '1' only, so S3_FORCE_PATH_STYLE=true silently did nothing
    // there — and a wrong addressing style shows up as TLS/404 errors that look
    // nothing like a config typo.
    forcePathStyle: /^(1|true|yes)$/i.test(
      process.env.S3_FORCE_PATH_STYLE ?? '',
    ),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      sessionToken: process.env.S3_SESSION_TOKEN,
    },
  });
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = createS3Client();
    this.bucket = process.env.S3_BUCKET_NAME!;
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

    // Streamed to a temp file, then renamed onto destPath — not streamed
    // straight to destPath. A stream that fails partway (activity timeout,
    // worker restart) must never leave a truncated file sitting at destPath:
    // callers (the worker's ensureLocalFile) treat "file exists" as "file is
    // complete" and would silently parse/embed the truncated content on the
    // next retry. rename() within the same directory is atomic, so destPath
    // only ever appears once the full stream has landed.
    const tmpPath = `${destPath}.download-${randomBytes(6).toString('hex')}.tmp`;
    try {
      await pipeline(
        response.Body as NodeJS.ReadableStream,
        createWriteStream(tmpPath),
      );
      await fs.rename(tmpPath, destPath);
    } catch (err) {
      await fs.rm(tmpPath, { force: true });
      throw err;
    }
  }
}
