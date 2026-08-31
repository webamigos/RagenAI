import { Injectable, NotFoundException } from '@nestjs/common';
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === '1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Ported from ragen-app's src/libs/storage/s3-provider.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Deviation: ragen-app selects between this and a `LocalStorageProvider`
 * via `STORAGE_PROVIDER` (a local-dev convenience for running without
 * real S3 credentials). apps/api's own `.env.example` only documents the
 * S3 credentials, so this ports the S3 path only — add a local variant
 * here if apps/api ever needs the same dev fallback.
 */
@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = createS3Client();
    this.bucket = process.env.AWS_S3_BUCKET_NAME!;
  }

  async upload(key: string, content: Buffer): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: content,
      },
    });

    await upload.done();
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new NotFoundException(`No content found for key: ${key}`);
    }

    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
