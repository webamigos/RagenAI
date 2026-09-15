import { describe, expect, it } from 'vitest';
import { type z } from 'zod';

import * as fragments from '../fragments';
import { encryptionRules, litellmRules, storageRules } from '../provider-rules';
import { parseEnv } from '../parse';

/**
 * These rules exist because the fragments they guard declare every credential
 * optional, so merging one validates nothing beyond the types — and two of the
 * three apps that merged them then paired neither.
 */
const storageSchema = fragments.storage.superRefine(storageRules);
const encryptionSchema = fragments.encryption.superRefine(encryptionRules);
/**
 * Merged with `targetEnv`, not used bare: `requiredInDeployedEnvs` reads
 * `TARGET_ENV`, and zod strips keys the schema does not declare — so the
 * fragment on its own would make every case here pass for the wrong reason.
 * The apps merge both, which is what this mirrors.
 */
const litellmSchema = fragments.targetEnv
  .merge(fragments.litellm)
  .superRefine((env, ctx) => litellmRules(env, ctx));

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
 * `LITELLM_MASTER_KEY` was demanded of every deployed environment by four
 * apps, with the reason "every model call is authenticated against the proxy"
 * — true only while `LLM_GATEWAY` defaulted to `litellm`. Once the default
 * became `native`, that rule refused to boot correctly configured deployments
 * over a credential nothing on their path uses.
 */
describe('litellmRules', () => {
  const deployed = {
    LITELLM_PROXY_URL: 'http://proxy:4000',
    TARGET_ENV: 'production',
  };

  it('requires the key when the proxy is named', () => {
    expect(
      namesOf(litellmSchema, { ...deployed, LLM_GATEWAY: 'litellm' }),
    ).toContain('LITELLM_MASTER_KEY');
  });

  it('does not require it when the gateway is native', () => {
    expect(
      namesOf(litellmSchema, { ...deployed, LLM_GATEWAY: 'native' }),
    ).not.toContain('LITELLM_MASTER_KEY');
  });

  /**
   * The case the flip created: an unset value reaches the rule as the enum's
   * default, which is `native`. Asserted separately from the explicit
   * `native` above, because the two stop being the same thing when B6 moves
   * the default again.
   */
  it('does not require it when nothing names a gateway', () => {
    expect(namesOf(litellmSchema, deployed)).not.toContain(
      'LITELLM_MASTER_KEY',
    );
  });

  it('is silent outside a deployed environment, proxy or not', () => {
    expect(
      namesOf(litellmSchema, {
        LITELLM_PROXY_URL: 'http://proxy:4000',
        TARGET_ENV: 'local',
        LLM_GATEWAY: 'litellm',
      }),
    ).not.toContain('LITELLM_MASTER_KEY');
  });
});
