import { randomUUID } from 'crypto';

import { RedisService } from '@/app/lib/services/redis';
import { ApiKeyStorage } from './api-key-storage.service';
import { HashingService } from './hashing.service';
import { NotFoundException } from './api-errors.service';
import { logger } from '@/app/lib/utils/logger';
import {
  ApiKey,
  HashedKey,
  OrgId,
  UserId,
  ProjectId,
  KeyId,
} from '../types/brand';
import { GenerateApiKeyDto } from '../dtos/generate-api-key.dto';
import { GeneratedApiKeyPayload } from '../dtos/generate-api-key.payload';

export class ApiKeysService {
  private readonly hashingService: HashingService;
  private readonly apiKeyStorage: ApiKeyStorage;
  private readonly encoding = 'base64url';
  private readonly randomPartLength = 6;
  private readonly keyPrefix = 'sk-';

  constructor() {
    const redisService = RedisService.getInstance();
    this.hashingService = new HashingService();
    // ApiKeyStorage intentionally uses Redis for hashed key lookups and invalidation.
    // Prisma holds API key metadata (name, masked_value, last_used_at) while Redis
    // provides fast O(1) lookup of hashed keys during request authentication.
    this.apiKeyStorage = new ApiKeyStorage(redisService);
  }

  async createAndHash(
    generateApiKeyDto: GenerateApiKeyDto
  ): Promise<GeneratedApiKeyPayload> {
    const apiKey = this.generateApiKey(generateApiKeyDto); // generated orgId key
    const keyId: KeyId = generateApiKeyDto.keyId;
    const hashedKey = await this.hashingService.hash(apiKey); // hashed key for storage

    try {
      await this.apiKeyStorage.insert(keyId, hashedKey);
    } catch (error) {
      logger.error(
        { err: error, keyId },
        'Failed to store hashed API key in Redis'
      );
      throw new Error('Failed to persist API key', { cause: error });
    }

    return { apiKey, hashedKey };
  }

  async validate(apiKey: ApiKey, hashedKey: HashedKey): Promise<boolean> {
    return this.hashingService.compare(apiKey, hashedKey);
  }

  async loadApiKey(keyId: KeyId): Promise<HashedKey> {
    const hashedKey = await this.apiKeyStorage.getValue(keyId);
    if (!hashedKey) {
      throw new NotFoundException(`API key not found for keyId: ${keyId}`);
    }
    return hashedKey as HashedKey;
  }

  private generateApiKey(apiKeyDto: GenerateApiKeyDto): ApiKey {
    const { orgId, userId, projectId, keyId } = apiKeyDto;
    // TODO: below random id generates each new key for same data set
    // after removing it we can regenerate key (deactivate and activate). Activate will generate then the same value as before
    const content = `${randomUUID().substring(
      0,
      this.randomPartLength
    )} ${orgId} ${userId} ${projectId} ${keyId}`;
    return `${this.keyPrefix}${Buffer.from(content).toString(
      this.encoding
    )}` as ApiKey;
  }

  extractDataFromApiKey(apiKey: ApiKey): GenerateApiKeyDto {
    // key format: sk-YTdlNDlkIDU1NSA2NiA3Nw
    const plainKey = apiKey.replace(this.keyPrefix, '');
    // eslint-disable-next-line
    const [
      randomPart,
      extractedOrgId,
      extractedUserId,
      extractedProjectId,
      extractedKeyId,
    ] = Buffer.from(plainKey, this.encoding).toString('ascii').split(' ');

    const orgId = extractedOrgId as OrgId;
    const userId = extractedUserId as UserId;
    const projectId = parseInt(extractedProjectId) as ProjectId;
    const keyId = parseInt(extractedKeyId) as KeyId;

    return { orgId, userId, projectId, keyId };
  }
}
