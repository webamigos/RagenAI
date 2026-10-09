import { describe, it, expect } from 'vitest';
import { DEFAULT_VECTOR_SIZE } from '@ragenai/rag-core';

import { inspectEnvironment } from '../services/queries/inspect-environment';

/** An environment with nothing left to report, as a baseline to break. */
const completeEnv = {
  DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/ragen',
  BETTER_AUTH_SECRET: 'a'.repeat(64),
  SECRET_KEY: 'b'.repeat(64),
  OPENAI_API_KEY: 'sk-test',
  DEFAULT_MODEL: 'gemini-3-flash-preview',
  DEFAULT_MODEL_PROVIDER: 'litellm',
  QDRANT_URL: 'http://localhost:6333',
  REDIS_URL: 'redis://localhost:56379',
  SMTP_HOST: 'smtp.example.com',
  NEXT_PUBLIC_APP_URL: 'https://ragen.example.com',
  TARGET_ENV: 'production',
  ENCRYPTION_MASTER_KEY: 'c'.repeat(64),
};

const idsOf = (env: Record<string, string | undefined>) =>
  inspectEnvironment(env).findings.map((f) => f.id);

describe('inspectEnvironment', () => {
  it('reports nothing when everything is configured', () => {
    const report = inspectEnvironment(completeEnv);

    expect(report.findings).toEqual([]);
    expect(report.hasBlockingIssues).toBe(false);
  });

  it('reports every required setting on a bare environment', () => {
    const report = inspectEnvironment({});

    expect(report.hasBlockingIssues).toBe(true);
    expect(
      report.findings.filter((f) => f.severity === 'required'),
    ).toHaveLength(6);
    expect(idsOf({})).toContain('database');
    expect(idsOf({})).toContain('redis');
  });

  it('asks for model-provider credentials when no family has any', () => {
    // The check this replaced named `LITELLM_PROXY_URL`, which #1194 deleted —
    // so it reported a blocking issue on every install, with nothing an
    // operator could set to clear it.
    expect(idsOf({ ...completeEnv, OPENAI_API_KEY: undefined })).toContain(
      'model-provider-credentials',
    );
  });

  it('accepts any one complete provider family, or an OpenAI-compatible connection', () => {
    // The families need different variables and a deployment needs one, so
    // this is "any family" — but all of that family's variables, as the
    // gateway demands them.
    for (const family of [
      { OPENROUTER_API_KEY: 'set' },
      { ANTHROPIC_API_KEY: 'set' },
      { AZURE_API_KEY: 'set', AZURE_API_BASE: 'https://x.openai.azure.com' },
      { AWS_BEDROCK_REGION: 'eu-central-1' },
      { VERTEX_PROJECT: 'p', VERTEX_LOCATION: 'europe-central2' },
    ]) {
      expect(
        idsOf({ ...completeEnv, OPENAI_API_KEY: undefined, ...family }),
      ).not.toContain('model-provider-credentials');
    }

    // A connection's variables are named after the route's `connection`, which
    // this file cannot enumerate — so the shape is what is recognised.
    expect(
      idsOf({
        ...completeEnv,
        OPENAI_API_KEY: undefined,
        LLM_OLLAMA_BASE_URL: 'http://localhost:11434/v1',
      }),
    ).not.toContain('model-provider-credentials');
  });

  it('does not accept half a family, which fails at the first call', () => {
    for (const half of [{ AZURE_API_KEY: 'set' }, { VERTEX_PROJECT: 'p' }]) {
      expect(
        idsOf({ ...completeEnv, OPENAI_API_KEY: undefined, ...half }),
      ).toContain('model-provider-credentials');
    }
  });

  it('treats an empty or whitespace-only value as unset', () => {
    expect(idsOf({ ...completeEnv, DATABASE_URL: '' })).toContain('database');
    expect(idsOf({ ...completeEnv, DATABASE_URL: '   ' })).toContain(
      'database',
    );
  });

  it('narrows a partially-configured required group to the missing variables', () => {
    const report = inspectEnvironment({
      ...completeEnv,
      DEFAULT_MODEL_PROVIDER: undefined,
    });
    const finding = report.findings.find((f) => f.id === 'default-model');

    expect(finding?.vars).toEqual(['DEFAULT_MODEL_PROVIDER']);
  });

  it('accepts either app-URL variable', () => {
    // base-url.ts prefers BETTER_AUTH_URL and falls back to NEXT_PUBLIC_APP_URL,
    // so nagging for the other one when either is set would be wrong.
    expect(idsOf({ ...completeEnv, NEXT_PUBLIC_APP_URL: undefined })).toContain(
      'app-url',
    );
    expect(
      idsOf({
        ...completeEnv,
        NEXT_PUBLIC_APP_URL: undefined,
        BETTER_AUTH_URL: 'https://ragen.example.com',
      }),
    ).not.toContain('app-url');
  });

  it('reports an unset TARGET_ENV', () => {
    expect(idsOf({ ...completeEnv, TARGET_ENV: undefined })).toContain(
      'target-env',
    );
  });

  it('accepts any one alternative for the recommended groups', () => {
    // Mail: SMTP_HOST alone is enough not to nag, and so is a Resend key —
    // they are alternative transports, not both required.
    expect(idsOf(completeEnv)).not.toContain('mail');
    expect(idsOf({ ...completeEnv, SMTP_HOST: undefined })).toContain('mail');
    expect(
      idsOf({
        ...completeEnv,
        SMTP_HOST: undefined,
        RESEND_API_KEY: 're_test',
      }),
    ).not.toContain('mail');

    // Encryption: a KMS key id substitutes for the local master key.
    const viaKms = {
      ...completeEnv,
      ENCRYPTION_MASTER_KEY: undefined,
      AWS_KMS_KEY_ID: 'arn:aws:kms:eu-central-1:1:key/abc',
    };
    expect(idsOf(viaKms)).not.toContain('message-encryption');
  });

  it('accepts OpenRouter alone — the Railway template configures nothing else', () => {
    // The checklist kept its own list of provider families and it did not
    // have OpenRouter, so this install was told it had no model provider.
    const report = inspectEnvironment({
      ...completeEnv,
      OPENAI_API_KEY: undefined,
      OPENROUTER_API_KEY: 'sk-or-test',
    });

    expect(report.findings.map((f) => f.id)).not.toContain(
      'model-provider-credentials',
    );
  });

  it('recommends a moderation key when no OpenAI key is set', () => {
    // An OpenRouter-only install chats, but the content-moderation guardrail
    // has no provider there; that is a recommendation, never a block.
    const env = {
      ...completeEnv,
      OPENAI_API_KEY: undefined,
      OPENROUTER_API_KEY: 'sk-or-test',
    };

    expect(idsOf(env)).toEqual(['moderation']);
    expect(inspectEnvironment(env).hasBlockingIssues).toBe(false);
    expect(idsOf({ ...env, OPENAI_MODERATION_KEY: 'sk-moderation' })).toEqual(
      [],
    );
  });

  it('does not block on recommended settings alone', () => {
    const report = inspectEnvironment({ ...completeEnv, SMTP_HOST: undefined });

    expect(report.findings.map((f) => f.id)).toEqual(['mail']);
    expect(report.hasBlockingIssues).toBe(false);
  });

  describe('job runtime', () => {
    it('never asks for Temporal under BullMQ, the default', () => {
      // It used to, on every install, for an engine ADR-44 made optional.
      expect(idsOf(completeEnv)).not.toContain('temporal');
      expect(idsOf({ ...completeEnv, WORKER_RUNTIME: 'bullmq' })).not.toContain(
        'temporal',
      );
    });

    it('requires REDIS_URL under BullMQ', () => {
      const report = inspectEnvironment({
        ...completeEnv,
        REDIS_URL: undefined,
      });
      const finding = report.findings.find((f) => f.id === 'redis');

      expect(finding?.severity).toBe('required');
      expect(report.hasBlockingIssues).toBe(true);
    });

    it('recommends the Temporal address, and not Redis, under Temporal', () => {
      const env = {
        ...completeEnv,
        REDIS_URL: undefined,
        WORKER_RUNTIME: 'temporal',
      };

      expect(idsOf(env)).toEqual(['temporal']);
      expect(inspectEnvironment(env).hasBlockingIssues).toBe(false);
      expect(
        idsOf({ ...env, TEMPORAL_SERVER_ADDRESS: 'localhost:7233' }),
      ).toEqual([]);
    });

    it('leaves an unknown WORKER_RUNTIME to the worker, which names it', () => {
      expect(() =>
        inspectEnvironment({ ...completeEnv, WORKER_RUNTIME: 'sidekiq' }),
      ).not.toThrow();
    });
  });

  describe('embedding dimensions', () => {
    it('blocks when VECTOR_SIZE contradicts a known EMBEDDINGS_MODEL', () => {
      const report = inspectEnvironment({
        ...completeEnv,
        EMBEDDINGS_MODEL: 'cohere-embed-multilingual-v3',
        VECTOR_SIZE: String(DEFAULT_VECTOR_SIZE),
      });
      const finding = report.findings.find(
        (f) => f.id === 'embeddings-dimension-mismatch',
      );

      expect(report.hasBlockingIssues).toBe(true);
      expect(finding?.example).toBe('VECTOR_SIZE=1024');
      // The rendered message has to name both sides, or it sends the operator
      // to change the wrong one.
      expect(finding?.values).toEqual({
        model: 'cohere-embed-multilingual-v3',
        expected: 1024,
        configured: String(DEFAULT_VECTOR_SIZE),
      });
    });

    it('stays quiet when the pair agrees', () => {
      expect(
        idsOf({
          ...completeEnv,
          EMBEDDINGS_MODEL: 'cohere-embed-multilingual-v3',
          VECTOR_SIZE: '1024',
        }),
      ).not.toContain('embeddings-dimension-mismatch');
    });

    it('stays quiet for a model whose dimensions we do not know', () => {
      expect(
        idsOf({
          ...completeEnv,
          EMBEDDINGS_MODEL: 'some-self-hosted-model',
          VECTOR_SIZE: '768',
        }),
      ).not.toContain('embeddings-dimension-mismatch');
    });

    // Overriding one and not the other is the dangerous case, not a safe one:
    // the unset side keeps its default and contradicts the one that changed.
    it('catches a one-sided override against the other default', () => {
      expect(
        idsOf({
          ...completeEnv,
          EMBEDDINGS_MODEL: 'cohere-embed-multilingual-v3',
        }),
      ).toContain('embeddings-dimension-mismatch');
      expect(idsOf({ ...completeEnv, VECTOR_SIZE: '1024' })).toContain(
        'embeddings-dimension-mismatch',
      );
    });

    it('stays quiet when neither is set', () => {
      expect(idsOf(completeEnv)).not.toContain('embeddings-dimension-mismatch');
    });
  });

  describe('object storage credentials', () => {
    it('stays quiet when STORAGE_PROVIDER is unset (defaults to local)', () => {
      expect(idsOf(completeEnv)).not.toContain('object-storage-credentials');
    });

    it('blocks when STORAGE_PROVIDER=s3 but credentials are missing', () => {
      const report = inspectEnvironment({
        ...completeEnv,
        STORAGE_PROVIDER: 's3',
      });
      const finding = report.findings.find(
        (f) => f.id === 'object-storage-credentials',
      );

      expect(report.hasBlockingIssues).toBe(true);
      expect(finding?.vars).toEqual([
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'S3_BUCKET_NAME',
        'S3_REGION',
      ]);
    });

    it('narrows to only the missing variables', () => {
      const report = inspectEnvironment({
        ...completeEnv,
        STORAGE_PROVIDER: 's3',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
        S3_REGION: 'pl-waw',
      });
      const finding = report.findings.find(
        (f) => f.id === 'object-storage-credentials',
      );

      expect(finding?.vars).toEqual(['S3_BUCKET_NAME']);
    });

    it('stays quiet once every credential is set', () => {
      expect(
        idsOf({
          ...completeEnv,
          STORAGE_PROVIDER: 's3',
          S3_ACCESS_KEY_ID: 'k',
          S3_SECRET_ACCESS_KEY: 's',
          S3_BUCKET_NAME: 'ragen-documents',
          S3_REGION: 'pl-waw',
        }),
      ).not.toContain('object-storage-credentials');
    });

    // The old AWS_-prefixed names must not silently satisfy this check —
    // that's the exact collision this rename exists to prevent.
    it('does not accept the old AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_DEFAULT_REGION names', () => {
      expect(
        idsOf({
          ...completeEnv,
          STORAGE_PROVIDER: 's3',
          AWS_ACCESS_KEY_ID: 'k',
          AWS_SECRET_ACCESS_KEY: 's',
          AWS_DEFAULT_REGION: 'pl-waw',
          S3_BUCKET_NAME: 'ragen-documents',
        }),
      ).toContain('object-storage-credentials');
    });
  });
});
