// export type Brand<T> = T & { readonly brand: unique symbol };
export type Brand<T, B> = T & { readonly __brand: B };

// extra branded types to help not to mismatch passing params to services
export type OrgId = Brand<string, 'OrgId'>;
export type ProjectId = Brand<number, 'ProjectId'>;
export type KeyId = Brand<number, 'KeyId'>;

export type ApiKey = Brand<string, 'ApiKey'>;
export type HashedKey = Brand<string, 'HashedKey'>;
