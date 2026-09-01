/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from './api-keys.service.js';
import { VaultClient } from '../../vault/vault.client.js';
import { type KeyId, type ApiKey } from '../types/brand.js';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let vaultClient: jest.Mocked<VaultClient>;

  const testUuid = '550e8400-e29b-41d4-a716-446655440000';
  const keyId = testUuid as KeyId;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: VaultClient,
          useValue: {
            storeToken: jest.fn().mockResolvedValue(undefined),
            retrieveToken: jest.fn(),
            deleteToken: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(ApiKeysService);
    vaultClient = module.get(VaultClient);
  });

  describe('parseApiKey', () => {
    it('should extract keyId from opaque key format', () => {
      const parsed = service.parseApiKey(
        `sk-${testUuid}.randomsecretpart` as ApiKey,
      );
      expect(parsed.keyId).toBe(testUuid);
    });

    it('should throw on key without sk- prefix', () => {
      expect(() => service.parseApiKey('bad-key' as ApiKey)).toThrow(
        'Invalid API key format',
      );
    });

    it('should throw on key without dot separator', () => {
      expect(() =>
        service.parseApiKey(`sk-${testUuid}nodot` as ApiKey),
      ).toThrow('Invalid API key format');
    });

    it('should throw on key with empty keyId', () => {
      expect(() => service.parseApiKey('sk-.secret' as ApiKey)).toThrow(
        'Invalid API key format',
      );
    });

    it('should throw on key with empty secret', () => {
      expect(() => service.parseApiKey(`sk-${testUuid}.` as ApiKey)).toThrow(
        'Invalid API key format',
      );
    });

    it('should throw on key with non-UUID keyId', () => {
      expect(() =>
        service.parseApiKey('sk-not-a-uuid.secret' as ApiKey),
      ).toThrow('Invalid API key format');
    });
  });

  describe('validate', () => {
    it('should return true when vault has matching key', async () => {
      const apiKey = `sk-${testUuid}.mysecret` as ApiKey;
      vaultClient.retrieveToken.mockResolvedValue({
        access_token: apiKey,
      });

      const isValid = await service.validate(apiKey, keyId);
      expect(isValid).toBe(true);
      expect(vaultClient.retrieveToken).toHaveBeenCalledWith(
        `api-key-${testUuid}`,
        'ragen-api-key',
      );
    });

    it('should return false when vault has no key', async () => {
      vaultClient.retrieveToken.mockResolvedValue(null);

      const isValid = await service.validate(
        `sk-${testUuid}.invalid` as ApiKey,
        keyId,
      );
      expect(isValid).toBe(false);
    });

    it('should return false when key does not match', async () => {
      vaultClient.retrieveToken.mockResolvedValue({
        access_token: `sk-${testUuid}.different`,
      });

      const isValid = await service.validate(
        `sk-${testUuid}.invalid` as ApiKey,
        keyId,
      );
      expect(isValid).toBe(false);
    });
  });

  describe('revoke', () => {
    it('should delete the key from vault', async () => {
      await service.revoke(keyId);
      expect(vaultClient.deleteToken).toHaveBeenCalledWith(
        `api-key-${testUuid}`,
        'ragen-api-key',
      );
    });
  });
});
