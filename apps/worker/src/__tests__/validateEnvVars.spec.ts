import { validateEnvs } from '../validateEnvVars';

const ORIGINAL_ENV = process.env;

/** A minimal environment that must pass, so each case below changes one thing. */
const VALID: Record<string, string> = {
  TARGET_ENV: 'local',
  DATABASE_URL: 'postgresql://postgres:pass@localhost:55432/smartrag',
  TEMPORAL_SERVER_ADDRESS: 'localhost:7233',
  REDIS_URL: 'redis://localhost:56379',
  SECRET_KEY: 'secret',
  LITELLM_PROXY_URL: 'http://localhost:4000',
  SCW_API_BASE: 'https://api.scaleway.ai/v1',
  SCW_API_KEY: 'scw-key',
  EMBEDDINGS_MODEL: 'bge-multilingual-gemma2',
};

function withEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...VALID, ...overrides } as NodeJS.ProcessEnv;
  return validateEnvs();
}

describe('validateEnvs', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('accepts a minimal local environment', () => {
    expect(withEnv({}).success).toBe(true);
  });

  it('demands TARGET_ENV rather than defaulting it', () => {
    // A deployed worker with no TARGET_ENV would otherwise read as "local"
    // and skip every staging/production rule below.
    expect(withEnv({ TARGET_ENV: undefined }).success).toBe(false);
  });

  describe('storage', () => {
    it('requires the s3 credentials once s3 is chosen', () => {
      const result = withEnv({ STORAGE_PROVIDER: 's3' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.path[0])).toEqual(
          expect.arrayContaining([
            'S3_BUCKET_NAME',
            'S3_REGION',
            'S3_ACCESS_KEY_ID',
            'S3_SECRET_ACCESS_KEY',
          ]),
        );
      }
    });

    it('defaults to local and asks for nothing (ADR-27)', () => {
      expect(withEnv({ STORAGE_PROVIDER: undefined }).success).toBe(true);
    });

    it('treats a blank STORAGE_PROVIDER as unset, as @ragenai/storage does', () => {
      // The two must agree, or validation rejects a config the runtime
      // would happily accept.
      expect(withEnv({ STORAGE_PROVIDER: '  ' }).success).toBe(true);
    });
  });

  describe('deployed environments', () => {
    it('requires LITELLM_MASTER_KEY in production', () => {
      const result = withEnv({
        TARGET_ENV: 'production',
        QDRANT_URL: 'http://qdrant:6333',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.path[0])).toContain(
          'LITELLM_MASTER_KEY',
        );
      }
    });

    it('requires a vector store in production', () => {
      const result = withEnv({
        TARGET_ENV: 'production',
        LITELLM_MASTER_KEY: 'sk-x',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.path[0])).toContain(
          'QDRANT_URL',
        );
      }
    });

    it('does not accept a Meilisearch key as a substitute for Qdrant', () => {
      // It used to. That escape hatch predates ADR-31: every ingest activity
      // delegates to qdrantService, which falls back to localhost:6333, so a
      // "Meilisearch only" deployment wrote every vector into its own
      // container and reported success.
      const result = withEnv({
        TARGET_ENV: 'production',
        LITELLM_MASTER_KEY: 'sk-x',
        MEILISEARCH_API_KEY: 'meili-key',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.path[0])).toContain(
          'QDRANT_URL',
        );
      }
    });

    it('accepts a complete production environment', () => {
      expect(
        withEnv({
          TARGET_ENV: 'production',
          LITELLM_MASTER_KEY: 'sk-x',
          QDRANT_URL: 'http://qdrant.railway.internal:6333',
        }).success,
      ).toBe(true);
    });

    it('asks for none of it locally, so a fresh clone runs', () => {
      expect(withEnv({ TARGET_ENV: 'local' }).success).toBe(true);
    });
  });

  describe('Pusher', () => {
    it('accepts all three or none', () => {
      expect(withEnv({}).success).toBe(true);
      expect(
        withEnv({
          PUSHER_APP_ID: 'a',
          PUSHER_KEY: 'b',
          PUSHER_SECRET: 'c',
        }).success,
      ).toBe(true);
    });

    it('rejects a half-configured group, which fails per-request rather than at boot', () => {
      const result = withEnv({ PUSHER_APP_ID: 'a', PUSHER_KEY: 'b' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('PUSHER_SECRET');
      }
    });
  });

  it('rejects a scheme-less LITELLM_PROXY_URL, which z.string().url() accepted', () => {
    // `new URL('localhost:4000')` parses: `localhost:` becomes the scheme.
    expect(withEnv({ LITELLM_PROXY_URL: 'localhost:4000' }).success).toBe(
      false,
    );
  });

  it('reports every problem at once rather than one per restart', () => {
    const result = withEnv({
      DATABASE_URL: undefined,
      SCW_API_KEY: undefined,
      EMBEDDINGS_MODEL: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});
