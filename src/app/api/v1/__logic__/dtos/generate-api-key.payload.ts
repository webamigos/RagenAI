import { ApiKey, HashedKey } from '../types/brand';

export type GeneratedApiKeyPayload = {
  apiKey: ApiKey;
  hashedKey: HashedKey;
};
