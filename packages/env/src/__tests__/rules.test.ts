import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  allOrNone,
  requiredForProvider,
  requiredInDeployedEnvs,
} from '../rules';
import { fragments } from '../index';

const { targetEnv } = fragments;

describe('requiredInDeployedEnvs', () => {
  const schema = targetEnv
    .extend({ LITELLM_MASTER_KEY: z.string().optional() })
    .superRefine((env, ctx) =>
      requiredInDeployedEnvs(env, ctx, ['LITELLM_MASTER_KEY']),
    );

  it.each(['local', 'test', 'ci'])(
    'stays optional when TARGET_ENV is %s, so a fresh clone still runs',
    (target) => {
      expect(schema.safeParse({ TARGET_ENV: target }).success).toBe(true);
    },
  );

  it.each(['staging', 'production'])(
    'is required when TARGET_ENV is %s',
    (target) => {
      const result = schema.safeParse({ TARGET_ENV: target });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('LITELLM_MASTER_KEY');
        expect(result.error.issues[0]?.message).toContain(target);
      }
    },
  );

  it('treats a whitespace-only value as unset', () => {
    const result = schema.safeParse({
      TARGET_ENV: 'production',
      LITELLM_MASTER_KEY: '   ',
    });

    expect(result.success).toBe(false);
  });
});

describe('allOrNone', () => {
  const NAMES = ['PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET'] as const;
  const schema = z
    .object({
      PUSHER_APP_ID: z.string().optional(),
      PUSHER_KEY: z.string().optional(),
      PUSHER_SECRET: z.string().optional(),
    })
    .superRefine((env, ctx) => allOrNone(env, ctx, NAMES, 'Pusher'));

  it('accepts none of them, which is a documented fallback', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('accepts all of them', () => {
    expect(
      schema.safeParse({
        PUSHER_APP_ID: 'a',
        PUSHER_KEY: 'b',
        PUSHER_SECRET: 'c',
      }).success,
    ).toBe(true);
  });

  it('rejects a half-configured group and names what is missing', () => {
    // Half-configured is worse than absent: the client constructs and then
    // fails per-request, which reads as "notifications sometimes do not
    // arrive" rather than as a configuration error.
    const result = schema.safeParse({ PUSHER_APP_ID: 'a' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const [issue] = result.error.issues;
      expect(issue?.message).toContain('Pusher');
      expect(issue?.message).toContain('PUSHER_KEY');
      expect(issue?.message).toContain('PUSHER_SECRET');
    }
  });
});

describe('requiredForProvider', () => {
  const schema = z
    .object({
      STORAGE_PROVIDER: z.enum(['s3', 'local']).default('local'),
      S3_BUCKET_NAME: z.string().optional(),
      S3_REGION: z.string().optional(),
    })
    .superRefine((env, ctx) =>
      requiredForProvider(env, ctx, 'STORAGE_PROVIDER', 's3', [
        'S3_BUCKET_NAME',
        'S3_REGION',
      ]),
    );

  it('demands nothing extra for the default provider', () => {
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ STORAGE_PROVIDER: 'local' }).success).toBe(true);
  });

  it("demands the chosen provider's credentials", () => {
    // Selecting s3 with no bucket currently only surfaces at the first
    // upload, long after the deploy looked healthy.
    const result = schema.safeParse({ STORAGE_PROVIDER: 's3' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(2);
      expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual([
        'S3_BUCKET_NAME',
        'S3_REGION',
      ]);
    }
  });
});
