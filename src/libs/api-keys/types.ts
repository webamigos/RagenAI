export type Brand<T, B> = T & { readonly __brand: B };

export type OrgId = Brand<string, 'OrgId'>;
export type UserId = Brand<string, 'UserId'>;
export type ProjectId = Brand<number, 'ProjectId'>;
export type KeyId = Brand<number, 'KeyId'>;

export type ApiKey = Brand<string, 'ApiKey'>;
export type HashedKey = Brand<string, 'HashedKey'>;

export type GenerateApiKeyDto = {
  orgId: OrgId;
  userId: UserId;
  projectId: ProjectId;
  keyId: KeyId;
};

export type GeneratedApiKeyPayload = {
  apiKey: ApiKey;
  hashedKey: HashedKey;
};
