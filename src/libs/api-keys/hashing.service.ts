import { compare, genSalt, hash } from 'bcrypt';

import { type HashedKey } from './types';

export class HashingService {
  async hash(data: string | Buffer): Promise<HashedKey> {
    const salt = await genSalt();
    return hash(data, salt) as Promise<HashedKey>;
  }

  compare(data: string | Buffer, encrypted: string): Promise<boolean> {
    return compare(data, encrypted);
  }
}
