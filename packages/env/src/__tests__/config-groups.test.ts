import { describe, expect, it } from 'vitest';

import {
  DATABASE_GROUP,
  REDIS_GROUP,
  TEMPORAL_GROUP,
  FIELD_GROUPS,
  MODELS_GROUP,
  VECTOR_STORE_GROUP,
  type FieldGroup,
} from '../config-groups';
import { configToEnv, defineConfig } from '../define-config';
import * as fragments from '../fragments';
import { parseEnv } from '../parse';

/**
 * Same contract as the seams: a group may only name variables the fragment it
 * describes actually declares. A misspelling here is worse than useless — the
 * installer would write a variable nothing reads.
 */
const FRAGMENT_FOR_GROUP: readonly {
  group: FieldGroup;
  fragment: { shape: Record<string, unknown> };
}[] = [
  { group: DATABASE_GROUP, fragment: fragments.database },
  { group: VECTOR_STORE_GROUP, fragment: fragments.qdrant },
  { group: MODELS_GROUP, fragment: fragments.models },
  { group: TEMPORAL_GROUP, fragment: fragments.temporal },
  { group: REDIS_GROUP, fragment: fragments.redis },
];

describe('flat groups agree with their fragments', () => {
  it.each(FRAGMENT_FOR_GROUP)(
    'every variable $group.group names is declared',
    ({ group, fragment }) => {
      const declared = Object.keys(fragment.shape);
      const named = [...group.required, ...(group.optional ?? [])];

      expect(named.filter((name) => !declared.includes(name))).toEqual([]);
    },
  );

  it('maps every variable it names to a field', () => {
    for (const group of FIELD_GROUPS) {
      const named = [...group.required, ...(group.optional ?? [])];
      const unmapped = named.filter((name) => !(name in group.fields));

      expect(unmapped, `${group.group} has unmapped variables`).toEqual([]);
    }
  });

  it('gives every field a distinct name within its group', () => {
    // Two variables sharing a field name would silently collide in
    // `configToEnv` — the later write wins and the other variable is dropped.
    for (const group of FIELD_GROUPS) {
      const fields = Object.values(group.fields);

      expect(new Set(fields).size, `${group.group} has a duplicate field`).toBe(
        fields.length,
      );
    }
  });
});

describe('configToEnv writes the flat groups', () => {
  it('turns a database group into its variables', () => {
    expect(
      configToEnv(
        defineConfig({
          database: {
            url: 'postgresql://user:pass@localhost:55432/ragen',
            directUrl: 'postgresql://user:pass@localhost:5432/ragen',
          },
        }),
      ),
    ).toEqual({
      DATABASE_URL: 'postgresql://user:pass@localhost:55432/ragen',
      DATABASE_DIRECT_URL: 'postgresql://user:pass@localhost:5432/ragen',
    });
  });

  it('names the model defaults by their job, not their variable', () => {
    expect(
      configToEnv(
        defineConfig({
          models: {
            chat: 'gemini-3-flash-preview',
            rephrase: 'gemini-2.5-flash',
            embeddings: 'bge-multilingual-gemma2',
          },
        }),
      ),
    ).toEqual({
      DEFAULT_MODEL: 'gemini-3-flash-preview',
      REPHRASE_MODEL: 'gemini-2.5-flash',
      EMBEDDINGS_MODEL: 'bge-multilingual-gemma2',
    });
  });

  it('omits a field left undefined', () => {
    expect(
      configToEnv(defineConfig({ vectorStore: { url: undefined } })),
    ).toEqual({});
  });

  it('writes seams and flat groups from one config', () => {
    const env = configToEnv(
      defineConfig({
        database: { url: 'postgresql://localhost:55432/ragen' },
        gateway: { url: 'http://localhost:4000', masterKey: 'sk-x' },
        storage: { provider: 'local' },
      }),
    );

    expect(env).toEqual({
      DATABASE_URL: 'postgresql://localhost:55432/ragen',
      LITELLM_PROXY_URL: 'http://localhost:4000',
      LITELLM_MASTER_KEY: 'sk-x',
      STORAGE_PROVIDER: 'local',
    });
  });
});

describe('a flat config that typechecks satisfies its fragment', () => {
  it('produces an environment the shared schema accepts', () => {
    // The same loop the seams close, for the groups that have no branch: the
    // installer writes what the schema parses, from one description.
    const schema = fragments.targetEnv
      .merge(fragments.database)
      .merge(fragments.litellm)
      .merge(fragments.qdrant)
      .merge(fragments.models);

    const env = configToEnv(
      defineConfig({
        database: { url: 'postgresql://user:pass@localhost:55432/ragen' },
        gateway: { url: 'http://localhost:4000' },
        vectorStore: { url: 'http://localhost:6333' },
        models: { chat: 'gemini-3-flash-preview' },
      }),
    );

    const result = parseEnv(schema, env);
    expect(result.ok ? null : result.report).toBeNull();
  });

  it('is rejected by the schema when a value is malformed', () => {
    // The config type says `string`; whether the string is a URL is still the
    // schema's job, and this proves the two are not the same check.
    const schema = fragments.targetEnv.merge(fragments.qdrant);
    const env = configToEnv(
      defineConfig({ vectorStore: { url: 'localhost:6333' } }),
    );

    expect(parseEnv(schema, env).ok).toBe(false);
  });
});

describe('the strengths a fragment comes in', () => {
  it('accepts a worker environment through the required variants', () => {
    const schema = fragments.targetEnv
      .merge(fragments.temporalRequired)
      .merge(fragments.redisRequired);

    expect(
      parseEnv(schema, {
        TEMPORAL_SERVER_ADDRESS: 'localhost:7233',
        REDIS_URL: 'redis://localhost:56379',
      }).ok,
    ).toBe(true);
  });

  it.each([['TEMPORAL_SERVER_ADDRESS'], ['REDIS_URL']])(
    'refuses a worker environment without %s',
    (name) => {
      // apps/worker has no fallback for either: it is the process that runs
      // the workflows, and it caches organization settings in Redis.
      const schema = fragments.targetEnv
        .merge(fragments.temporalRequired)
        .merge(fragments.redisRequired);
      const env: Record<string, string> = {
        TEMPORAL_SERVER_ADDRESS: 'localhost:7233',
        REDIS_URL: 'redis://localhost:56379',
      };
      delete env[name];

      const result = parseEnv(schema, env);
      expect(result.ok).toBe(false);
      expect(result.ok ? [] : result.issues.map((i) => i.name)).toContain(name);
    },
  );

  it('accepts an app environment without either, through the optional ones', () => {
    // apps/web and apps/api both fall back — to localhost:7233, and to
    // computing settings directly with rate limiting off.
    expect(
      parseEnv(
        fragments.targetEnv.merge(fragments.temporal).merge(fragments.redis),
        {},
      ).ok,
    ).toBe(true);
  });

  it('still rejects a malformed value in the optional variant', () => {
    expect(
      parseEnv(fragments.targetEnv.merge(fragments.redis), {
        REDIS_URL: 'not-a-url',
      }).ok,
    ).toBe(false);
  });
});

describe('a pair is all or nothing', () => {
  it('accepts both halves', () => {
    expect(
      configToEnv(
        defineConfig({
          tokenVault: { url: 'https://vault.example.com', secret: 'shh' },
        }),
      ),
    ).toEqual({
      RAGEN_VAULT_URL: 'https://vault.example.com',
      RAGEN_VAULT_SERVICE_SECRET: 'shh',
    });
  });

  it('accepts neither half', () => {
    expect(configToEnv(defineConfig({ tokenVault: {} }))).toEqual({});
  });

  it.each([
    ['url', { url: 'https://vault.example.com' }],
    ['secret', { secret: 'shh' }],
    ['connectorUrl', { connectorUrl: 'https://vault.example.com' }],
    ['connectorSecret', { connectorSecret: 'shh' }],
  ])('refuses %s alone', (_field, half) => {
    // The type permits half of a pair — the fields are independently optional
    // — and a URL without its secret produces 401s from the vault rather than
    // a legible configuration error (ADR-32).
    expect(() => configToEnv(defineConfig({ tokenVault: half }))).toThrow(
      /half-configured/,
    );
  });

  it('treats a blank half as absent, not as given', () => {
    // Matches `isSet` in rules.ts: a cleared Railway variable arrives as ''.
    expect(
      configToEnv(defineConfig({ tokenVault: { url: '  ', secret: '  ' } })),
    ).toEqual({});
  });

  it('refuses a real half beside a blank one', () => {
    expect(() =>
      configToEnv(
        defineConfig({
          tokenVault: { url: 'https://v.example.com', secret: '' },
        }),
      ),
    ).toThrow(/half-configured/);
  });

  it('names the pair rather than the group', () => {
    expect(() =>
      configToEnv(defineConfig({ tokenVault: { connectorUrl: 'https://v' } })),
    ).toThrow(/The token vault/);
  });
});

describe('one variable, two groups', () => {
  it('accepts the same Scaleway key in both features', () => {
    // The legitimate case, and the reason the guard compares values rather
    // than forbidding the second write: one account key, two features.
    const env = configToEnv(
      defineConfig({
        encryption: { provider: 'scaleway', keyId: 'kid', apiKey: 'scw-key' },
        reranker: {
          provider: 'scaleway',
          apiBase: 'https://api.scaleway.ai/v1',
          apiKey: 'scw-key',
        },
      }),
    );

    expect(env.SCW_API_KEY).toBe('scw-key');
    expect(env.ENCRYPTION_PROVIDER).toBe('scaleway');
    expect(env.RERANK_PROVIDER).toBe('scaleway');
  });

  it('refuses two different values for one variable', () => {
    // Not expressible as an environment: one of them would silently win.
    expect(() =>
      configToEnv(
        defineConfig({
          encryption: { provider: 'scaleway', keyId: 'kid', apiKey: 'one' },
          reranker: {
            provider: 'scaleway',
            apiBase: 'https://api.scaleway.ai/v1',
            apiKey: 'two',
          },
        }),
      ),
    ).toThrow(/SCW_API_KEY is set twice with different values/);
  });
});

describe('a required field is required', () => {
  it('rejects a database group with no url at compile time', () => {
    defineConfig({
      // @ts-expect-error -- `url` is required for the database group.
      database: { directUrl: 'postgresql://localhost:5432/ragen' },
    });
  });

  it('refuses a field the group does not name, at the point it is written', () => {
    // Not a type error, and the comment says why: `defineConfig` infers a
    // generic `C extends RagenConfig`, and TypeScript does not apply
    // excess-property checking to a literal inferred as a type parameter. So
    // `host` compiles, and dropping it silently would write an environment
    // missing a variable the author believed they had set.
    const config = defineConfig({
      database: {
        url: 'postgresql://localhost:55432/r',
        host: 'localhost',
      } as never,
    });

    expect(() => configToEnv(config)).toThrow(/no field "host"/);
  });

  it('refuses a group that does not exist', () => {
    // A typo in a group name would otherwise drop every variable under it.
    const config = defineConfig({ storge: { url: 'x' } } as never);

    expect(() => configToEnv(config)).toThrow(
      /"storge" is not a configuration group/,
    );
  });

  it('names the groups it would have accepted', () => {
    const config = defineConfig({ storge: { url: 'x' } } as never);

    expect(() => configToEnv(config)).toThrow(/expected one of: .*\bstorage\b/);
  });

  it('names the fields it would have accepted', () => {
    const config = defineConfig({ models: { chatt: 'x' } as never });

    expect(() => configToEnv(config)).toThrow(/expected one of: .*\bchat\b/);
  });
});
