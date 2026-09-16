import { describe, expect, it } from 'vitest';
import { type z } from 'zod';

import * as fragments from '../fragments';
import {
  encryptionRules,
  storageRules,
  workerRuntimeRules,
} from '../provider-rules';
import { parseEnv } from '../parse';

/**
 * These rules exist because the fragments they guard declare every credential
 * optional, so merging one validates nothing beyond the types — and two of the
 * three apps that merged them then paired neither.
 */
const storageSchema = fragments.storage.superRefine(storageRules);
const encryptionSchema = fragments.encryption.superRefine(encryptionRules);
const workerRuntimeSchema = fragments.workerRuntime
  .merge(fragments.temporal)
  .merge(fragments.redis)
  .superRefine(workerRuntimeRules);

const namesOf = <T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
) => {
  const result = parseEnv(schema, source);
  return result.ok ? [] : result.issues.map(({ name }) => name);
};

describe('storageRules', () => {
  it('requires nothing when the provider is local', () => {
    // `STORAGE_LOCAL_PATH` has a real default in @ragenai/storage.
    expect(parseEnv(storageSchema, { STORAGE_PROVIDER: 'local' }).ok).toBe(
      true,
    );
  });

  it('requires nothing when the provider is unset — local is the default', () => {
    expect(parseEnv(storageSchema, {}).ok).toBe(true);
  });

  it.each([
    ['S3_BUCKET_NAME'],
    ['S3_REGION'],
    ['S3_ACCESS_KEY_ID'],
    ['S3_SECRET_ACCESS_KEY'],
  ])('requires %s when the provider is s3', (name) => {
    const complete: Record<string, string> = {
      STORAGE_PROVIDER: 's3',
      S3_BUCKET_NAME: 'bucket',
      S3_REGION: 'fr-par',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    };
    expect(parseEnv(storageSchema, complete).ok).toBe(true);

    const { [name]: _omitted, ...missing } = complete;
    expect(namesOf(storageSchema, missing)).toContain(name);
  });

  it('reports every missing S3 credential at once', () => {
    // The non-throwing parse exists so a setup is not a restart-per-variable
    // loop.
    expect(namesOf(storageSchema, { STORAGE_PROVIDER: 's3' })).toEqual(
      expect.arrayContaining([
        'S3_BUCKET_NAME',
        'S3_REGION',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ]),
    );
  });
});

describe('encryptionRules', () => {
  it('requires nothing when no provider is chosen', () => {
    expect(parseEnv(encryptionSchema, {}).ok).toBe(true);
  });

  it.each([
    ['scaleway', { SCW_KEY_MANAGER_KEY_ID: 'id', SCW_API_KEY: 'key' }],
    ['kms', { AWS_KMS_KEY_ID: 'arn:aws:kms:::key/x' }],
    ['local', { ENCRYPTION_MASTER_KEY: 'base64key' }],
  ])('accepts %s with its key', (provider, credentials) => {
    expect(
      parseEnv(encryptionSchema, {
        ENCRYPTION_PROVIDER: provider,
        ...credentials,
      }).ok,
    ).toBe(true);
  });

  it.each([
    ['scaleway', 'SCW_KEY_MANAGER_KEY_ID'],
    ['scaleway', 'SCW_API_KEY'],
    ['kms', 'AWS_KMS_KEY_ID'],
    ['local', 'ENCRYPTION_MASTER_KEY'],
  ])('rejects %s without %s', (provider, name) => {
    // A provider that cannot be constructed used to read as "encryption not
    // configured" and silently downgrade PII ingest to masked-only.
    expect(
      namesOf(encryptionSchema, { ENCRYPTION_PROVIDER: provider }),
    ).toContain(name);
  });

  it("does not demand one provider's key for another", () => {
    expect(
      parseEnv(encryptionSchema, {
        ENCRYPTION_PROVIDER: 'kms',
        AWS_KMS_KEY_ID: 'arn:aws:kms:::key/x',
      }).ok,
    ).toBe(true);
  });

  it('checks that a key is present, not that it is usable', () => {
    // Parsing the master key needs @ragenai/crypto, which depends on this
    // package — so that check lives in the consumer. apps/worker has it.
    expect(
      parseEnv(encryptionSchema, {
        ENCRYPTION_PROVIDER: 'local',
        ENCRYPTION_MASTER_KEY: 'x',
      }).ok,
    ).toBe(true);
  });
});

/**
 * §9 of the worker-runtime spec: neither variable is required in general, and
 * each is required exactly when its runtime is selected.
 */
describe('workerRuntimeRules', () => {
  it('requires the Temporal address under temporal', () => {
    expect(
      namesOf(workerRuntimeSchema, { WORKER_RUNTIME: 'temporal' }),
    ).toEqual(['TEMPORAL_SERVER_ADDRESS']);
  });

  /**
   * The case the rule machinery did not previously handle. `WORKER_RUNTIME` is
   * usually unset, `requiredForProvider` matches the variable against a variant
   * name, and an unset variable matches none — so before `seamRule` learned
   * about `defaultVariant`, the default configuration validated nothing while
   * looking validated. Moving the worker's existing hard requirement into the
   * seam would have silently dropped it.
   */
  // ADR-44 moved the default, and with it which variable an unset runtime
  // demands. This is the assertion that would have silently kept demanding
  // Temporal's address from an install that runs no Temporal.
  it('requires Redis when the runtime is unset too, because bullmq is the default', () => {
    expect(namesOf(workerRuntimeSchema, {})).toEqual(['REDIS_URL']);
  });

  it('requires Redis under bullmq, and nothing about Temporal', () => {
    expect(namesOf(workerRuntimeSchema, { WORKER_RUNTIME: 'bullmq' })).toEqual([
      'REDIS_URL',
    ]);
  });

  it('accepts bullmq with a Redis url and no Temporal at all', () => {
    expect(
      parseEnv(workerRuntimeSchema, {
        WORKER_RUNTIME: 'bullmq',
        REDIS_URL: 'redis://localhost:6379',
      }).ok,
    ).toBe(true);
  });

  it('accepts temporal with an address and no Redis at all', () => {
    expect(
      parseEnv(workerRuntimeSchema, {
        WORKER_RUNTIME: 'temporal',
        TEMPORAL_SERVER_ADDRESS: 'temporal:7233',
      }).ok,
    ).toBe(true);
  });

  // Neither is required in general — the whole point of the seam. A flat list
  // would have to call both mandatory, which is wrong for every deployment.
  it('does not require the other runtime’s variable in either direction', () => {
    expect(
      namesOf(workerRuntimeSchema, {
        WORKER_RUNTIME: 'bullmq',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).not.toContain('TEMPORAL_SERVER_ADDRESS');
    expect(
      namesOf(workerRuntimeSchema, {
        WORKER_RUNTIME: 'temporal',
        TEMPORAL_SERVER_ADDRESS: 'temporal:7233',
      }),
    ).not.toContain('REDIS_URL');
  });

  it('treats a blank runtime as unset rather than as a variant', () => {
    expect(namesOf(workerRuntimeSchema, { WORKER_RUNTIME: '  ' })).toEqual([
      'REDIS_URL',
    ]);
  });
});
