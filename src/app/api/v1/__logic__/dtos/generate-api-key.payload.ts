import { type ApiKey, type HashedKey } from '../types/brand';

export type GeneratedApiKeyPayload = {
  apiKey: ApiKey;
  hashedKey: HashedKey;
};
