import { randomUUID } from 'crypto';

import { HashingService } from './hashing.service';
import {
  type ApiKey,
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
  type GenerateApiKeyDto,
  type GeneratedApiKeyPayload,
} from './types';

export class ApiKeysService {
  private readonly hashingService: HashingService;
  private readonly encoding = 'base64url';
  private readonly randomPartLength = 6;
  private readonly keyPrefix = 'sk-';

  constructor() {
    this.hashingService = new HashingService();
  }

  async createAndHash(
    generateApiKeyDto: GenerateApiKeyDto,
  ): Promise<GeneratedApiKeyPayload> {
    const apiKey = this.generateApiKey(generateApiKeyDto);
    const hashedKey = await this.hashingService.hash(apiKey);
    return { apiKey, hashedKey };
  }

  async validate(apiKey: ApiKey, hashedKey: string): Promise<boolean> {
    return this.hashingService.compare(apiKey, hashedKey);
  }

  private generateApiKey(apiKeyDto: GenerateApiKeyDto): ApiKey {
    const { orgId, userId, projectId, keyId } = apiKeyDto;
    const content = `${randomUUID().substring(
      0,
      this.randomPartLength,
    )} ${orgId} ${userId} ${projectId} ${keyId}`;
    return `${this.keyPrefix}${Buffer.from(content).toString(
      this.encoding,
    )}` as ApiKey;
  }

  extractDataFromApiKey(apiKey: ApiKey): GenerateApiKeyDto {
    const plainKey = apiKey.replace(this.keyPrefix, '');
    const [
      _randomPart,
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
