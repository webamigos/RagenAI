import { describe, expect, it } from 'vitest';

import { configToEnv, defineConfig } from '../define-config';
import * as fragments from '../fragments';
import { parseEnv } from '../parse';
import { encryptionRules, storageRules } from '../provider-rules';

/**
 * The claim this file has to earn: a config that typechecks cannot produce an
 * environment the boot-time check rejects for a missing variable. Both sides
 * derive from `provider-seams.ts`, so the test is whether the derivation is
 * actually wired, not whether the two lists were typed identically.
 */
const schema = fragments.targetEnv
  .merge(fragments.storage)
  .merge(fragments.encryption)
  .superRefine((env, ctx) => {
    storageRules(env, ctx);
    encryptionRules(env, ctx);
  });

describe('defineConfig', () => {
  it('accepts a complete s3 choice and names the variables the schema wants', () => {
    const config = defineConfig({
      storage: {
        provider: 's3',
        bucketName: 'ragen',
        region: 'fr-par',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    });

    expect(configToEnv(config)).toEqual({
      STORAGE_PROVIDER: 's3',
      S3_BUCKET_NAME: 'ragen',
      S3_REGION: 'fr-par',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
  });

  it('accepts local storage, which requires nothing', () => {
    expect(
      configToEnv(defineConfig({ storage: { provider: 'local' } })),
    ).toEqual({ STORAGE_PROVIDER: 'local' });
  });

  it('carries the optional fields when they are given', () => {
    const env = configToEnv(
      defineConfig({
        storage: {
          provider: 's3',
          bucketName: 'ragen',
          region: 'fr-par',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          endpoint: 'https://s3.fr-par.scw.cloud',
          forcePathStyle: 'true',
        },
      }),
    );

    expect(env.S3_ENDPOINT_URL).toBe('https://s3.fr-par.scw.cloud');
    expect(env.S3_FORCE_PATH_STYLE).toBe('true');
  });

  it('omits an undefined field rather than writing it blank', () => {
    // A blank variable means unset (see `blankAsUndefined`), so writing
    // `S3_ENDPOINT_URL=` would say something the schema then has to undo.
    const env = configToEnv(
      defineConfig({
        storage: {
          provider: 's3',
          bucketName: 'ragen',
          region: 'fr-par',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          endpoint: undefined,
        },
      }),
    );

    expect(env).not.toHaveProperty('S3_ENDPOINT_URL');
  });

  it('handles every encryption provider', () => {
    expect(
      configToEnv(
        defineConfig({ encryption: { provider: 'kms', keyId: 'arn:…' } }),
      ),
    ).toEqual({ ENCRYPTION_PROVIDER: 'kms', AWS_KMS_KEY_ID: 'arn:…' });

    expect(
      configToEnv(
        defineConfig({
          encryption: { provider: 'local', masterKey: 'k' },
        }),
      ),
    ).toEqual({ ENCRYPTION_PROVIDER: 'local', ENCRYPTION_MASTER_KEY: 'k' });
  });
});

describe('a config that typechecks satisfies the boot-time rules', () => {
  it('for every provider of every seam', () => {
    // The loop this whole design exists to close: the type said the config was
    // complete, and the schema — reading the same table through a different
    // path — agrees.
    const configs = [
      defineConfig({
        storage: {
          provider: 's3',
          bucketName: 'ragen',
          region: 'fr-par',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
        },
        encryption: {
          provider: 'scaleway',
          keyId: 'kid',
          apiKey: 'scw',
        },
      }),
      defineConfig({
        storage: { provider: 'local' },
        encryption: { provider: 'local', masterKey: 'k' },
      }),
      defineConfig({
        storage: { provider: 'local', path: './data/storage' },
        encryption: { provider: 'kms', keyId: 'arn:…' },
      }),
    ];

    for (const config of configs) {
      const result = parseEnv(schema, configToEnv(config));
      expect(result.ok ? null : result.report).toBeNull();
    }
  });
});

describe('an incomplete choice is a type error, not a boot failure', () => {
  it('rejects s3 without its credentials at compile time', () => {
    const incomplete = defineConfig({
      // @ts-expect-error -- s3 requires bucketName, region, accessKeyId and
      // secretAccessKey. If this stops erroring, the type has stopped deriving
      // its requirements from the seam table and this whole file is decoration.
      storage: { provider: 's3', bucketName: 'ragen' },
    });

    // ...and if the type is defeated, the config never becomes an environment.
    expect(() => configToEnv(incomplete)).toThrow(/"region" is required/);
  });

  it('refuses a required field that is present but blank', () => {
    // The gap the type cannot close: the field is typed `string`, and `''`
    // satisfies `string`. Writing `S3_REGION=` would say "configured" where
    // every reader in this package understands blank as unset.
    const blank = defineConfig({
      storage: {
        provider: 's3',
        bucketName: 'ragen',
        region: '   ',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    });

    expect(() => configToEnv(blank)).toThrow(/"region" is required/);
    expect(() => configToEnv(blank)).toThrow(/reads as unset/);
  });

  it('names the variable the field becomes', () => {
    // The author wrote `region`; the thing that will be missing is S3_REGION.
    const blank = defineConfig({
      storage: {
        provider: 's3',
        bucketName: 'ragen',
        region: '',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    });

    expect(() => configToEnv(blank)).toThrow(/S3_REGION/);
  });

  it('rejects a provider that is not a variant', () => {
    defineConfig({
      // @ts-expect-error -- 'gcs' is not a storage variant.
      storage: { provider: 'gcs', bucketName: 'ragen' },
    });
  });

  it("rejects one variant's field under another", () => {
    defineConfig({
      // @ts-expect-error -- `masterKey` belongs to the local provider, not kms.
      encryption: { provider: 'kms', keyId: 'arn:…', masterKey: 'k' },
    });
  });
});
