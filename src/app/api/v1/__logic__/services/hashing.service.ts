import { compare, genSalt, hash } from 'bcrypt';

import { type Brand } from '../types/brand';

export type HashedKey = Brand<string, 'HashedKey'>;

export class HashingService {
  async hash(data: string | Buffer): Promise<HashedKey> {
    const salt = await genSalt();
    return hash(data, salt) as Promise<HashedKey>;
  }

  compare(data: string | Buffer, encrypted: string): Promise<boolean> {
    return compare(data, encrypted);
  }
}
