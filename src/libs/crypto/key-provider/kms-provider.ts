import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import type { KeyProvider } from './types';

export class KmsKeyProvider implements KeyProvider {
  private client: KMSClient;
  private keyId: string;

  constructor() {
    if (!process.env.AWS_KMS_KEY_ID) {
      throw new Error('AWS_KMS_KEY_ID is not configured');
    }

    this.client = new KMSClient({
      region: process.env.AWS_DEFAULT_REGION,
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
    this.keyId = process.env.AWS_KMS_KEY_ID;
  }

  async generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }> {
    const command = new GenerateDataKeyCommand({
      KeyId: this.keyId,
      KeySpec: 'AES_256',
    });

    const response = await this.client.send(command);

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('KMS GenerateDataKey returned incomplete response');
    }

    return {
      encryptedDek: Buffer.from(response.CiphertextBlob).toString('base64'),
      plaintextDek: Buffer.from(response.Plaintext),
    };
  }

  async decryptDataKey(encryptedDek: string): Promise<Buffer> {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(encryptedDek, 'base64'),
    });

    const response = await this.client.send(command);

    if (!response.Plaintext) {
      throw new Error('KMS Decrypt returned empty plaintext');
    }

    return Buffer.from(response.Plaintext);
  }
}
