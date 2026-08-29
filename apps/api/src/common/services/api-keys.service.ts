import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { VaultClient } from '../../vault/vault.client.js';
import { type ApiKey, type KeyId } from '../types/brand.js';

const VAULT_PROVIDER = 'ragen-api-key';
const KEY_PREFIX = 'sk-';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedApiKey {
  keyId: KeyId;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly vaultClient: VaultClient) {}

  parseApiKey(apiKey: ApiKey): ParsedApiKey {
    if (!apiKey.startsWith(KEY_PREFIX)) {
      throw new Error('Invalid API key format');
    }

    const withoutPrefix = apiKey.slice(KEY_PREFIX.length);
    const dotIndex = withoutPrefix.indexOf('.');

    if (
      dotIndex === -1 ||
      dotIndex === 0 ||
      dotIndex === withoutPrefix.length - 1
    ) {
      throw new Error('Invalid API key format');
    }

    const keyId = withoutPrefix.slice(0, dotIndex);

    if (!UUID_RE.test(keyId)) {
      throw new Error('Invalid API key format');
    }

    return { keyId: keyId as KeyId };
  }

  async validate(apiKey: ApiKey, keyId: KeyId): Promise<boolean> {
    const stored = await this.vaultClient.retrieveToken(
      this.vaultCustomerId(keyId),
      VAULT_PROVIDER,
    );

    if (!stored) {
      return false;
    }

    const apiKeyBuf = Buffer.from(apiKey);
    const storedBuf = Buffer.from(stored.access_token);

    if (apiKeyBuf.length !== storedBuf.length) {
      return false;
    }

    return timingSafeEqual(apiKeyBuf, storedBuf);
  }

  async revoke(keyId: KeyId): Promise<void> {
    await this.vaultClient.deleteToken(
      this.vaultCustomerId(keyId),
      VAULT_PROVIDER,
    );
  }

  private vaultCustomerId(keyId: KeyId): string {
    return `api-key-${keyId}`;
  }
}
