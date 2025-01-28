import { randomUUID } from 'crypto';

import { RedisService } from '@/app/lib/services/redis';
import { ApiKeyStorage } from './api-key-storage.service';
import { HashingService } from './hashing.service';
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
    this.apiKeyStorage = new ApiKeyStorage(redisService);
  }

  async createAndHash(
    generateApiKeyDto: GenerateApiKeyDto
  ): Promise<GeneratedApiKeyPayload> {
    const apiKey = this.generateApiKey(generateApiKeyDto); // generated orgId key
    const keyId: KeyId = generateApiKeyDto.keyId;
    const hashedKey = await this.hashingService.hash(apiKey); // hashed key for storage

    this.apiKeyStorage.insert(keyId, hashedKey);

    return { apiKey, hashedKey };
  }

  async validate(apiKey: ApiKey, hashedKey: HashedKey): Promise<boolean> {
    return this.hashingService.compare(apiKey, hashedKey);
  }

  async loadApiKey(keyId: KeyId): Promise<HashedKey> {
    return (await this.apiKeyStorage.getValue(keyId)) as HashedKey;
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
    // sk-YTdlNDlkIDU1NSA2NiA3Nw
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
