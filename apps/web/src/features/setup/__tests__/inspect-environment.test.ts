import { describe, it, expect } from 'vitest';
import { DEFAULT_VECTOR_SIZE } from '@ragenai/rag-core';

import { inspectEnvironment } from '../services/queries/inspect-environment';

/** An environment with nothing left to report, as a baseline to break. */
const completeEnv = {
  DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/smartrag',
  BETTER_AUTH_SECRET: 'a'.repeat(64),
  SECRET_KEY: 'b'.repeat(64),
  LITELLM_PROXY_URL: 'http://localhost:4000',
  DEFAULT_MODEL: 'gemini-3-flash-preview',
  DEFAULT_MODEL_PROVIDER: 'litellm',
  QDRANT_URL: 'http://localhost:6333',
  TEMPORAL_SERVER_ADDRESS: 'localhost:7233',
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
    ).toHaveLength(5);
    expect(idsOf({})).toContain('database');
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

  it('does not block on recommended settings alone', () => {
    const report = inspectEnvironment({
      ...completeEnv,
      TEMPORAL_SERVER_ADDRESS: undefined,
    });

    expect(
      idsOf({ ...completeEnv, TEMPORAL_SERVER_ADDRESS: undefined }),
    ).toContain('temporal');
    expect(report.hasBlockingIssues).toBe(false);
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
        'AWS_S3_BUCKET_NAME',
      ]);
    });

    it('narrows to only the missing variables', () => {
      const report = inspectEnvironment({
        ...completeEnv,
        STORAGE_PROVIDER: 's3',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      });
      const finding = report.findings.find(
        (f) => f.id === 'object-storage-credentials',
      );

      expect(finding?.vars).toEqual(['AWS_S3_BUCKET_NAME']);
    });

    it('stays quiet once every credential is set', () => {
      expect(
        idsOf({
          ...completeEnv,
          STORAGE_PROVIDER: 's3',
          S3_ACCESS_KEY_ID: 'k',
          S3_SECRET_ACCESS_KEY: 's',
          AWS_S3_BUCKET_NAME: 'ragen-documents',
        }),
      ).not.toContain('object-storage-credentials');
    });

    // The old AWS_-prefixed names must not silently satisfy this check —
    // that's the exact collision this rename exists to prevent.
    it('does not accept the old AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY names', () => {
      expect(
        idsOf({
          ...completeEnv,
          STORAGE_PROVIDER: 's3',
          AWS_ACCESS_KEY_ID: 'k',
          AWS_SECRET_ACCESS_KEY: 's',
          AWS_S3_BUCKET_NAME: 'ragen-documents',
        }),
      ).toContain('object-storage-credentials');
    });
  });
});
