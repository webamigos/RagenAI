import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { StorageProvider } from './types';

const streamPipeline = promisify(pipeline);

function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION,
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
  private client: S3Client;
  private bucket: string;

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
      throw new Error(`No content found for key: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`No content found for key: ${key}`);
    }

    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    const writeStream = createWriteStream(destPath);
    await streamPipeline(response.Body as NodeJS.ReadableStream, writeStream);
  }
}
