import { RedisService } from '@/app/lib/services/redis';
import { KeyId } from '../types/brand';
import { HashedKey } from './hashing.service';

export class ApiKeyStorage {
  constructor(private readonly redisService: RedisService) {}

  // TODO: consider using numeric ids instead of uuid for better keys performance
  async insert(keyId: KeyId, hashedKey: string): Promise<void> {
    await this.redisService.set(this.getRedisKey(keyId), hashedKey);
  }

  async invalidate(keyId: KeyId): Promise<void> {
    await this.redisService.del(this.getRedisKey(keyId));
  }

  async getValue(keyId: KeyId): Promise<HashedKey> {
    return (await this.redisService.get(this.getRedisKey(keyId))) as HashedKey;
  }

  private getRedisKey(keyId: KeyId): string {
    // TODO: in the future change keys to format:
    // org:1:key:1, org:1:key:2, org:6:key:6 or just key:6 where 1 and 6 is numeric id of organization
    return `key:${keyId}`;
  }
}
