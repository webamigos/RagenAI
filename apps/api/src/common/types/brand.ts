export type Brand<T, B> = T & { readonly __brand: B };

export type OrgId = Brand<string, 'OrgId'>;
export type UserId = Brand<string, 'UserId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type KeyId = Brand<string, 'KeyId'>;

export type ApiKey = Brand<string, 'ApiKey'>;
