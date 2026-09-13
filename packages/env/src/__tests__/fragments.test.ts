import { describe, it, expect } from 'vitest';

import { blankAsUndefined, fragments, httpUrl } from '../index';
import { z } from 'zod';

describe('blankAsUndefined', () => {
  const schema = z.object({
    VALUE: blankAsUndefined(z.string().optional()),
  });

  it.each(['', '   ', '\t'])(
    'treats %j as unset, which is what a cleared deploy variable is',
    (value) => {
      const result = schema.parse({ VALUE: value });
      expect(result.VALUE).toBeUndefined();
    },
  );

  it('passes a real value through untouched', () => {
    expect(schema.parse({ VALUE: 'ragen-web' }).VALUE).toBe('ragen-web');
  });

  it('lets a blank value fall back to a default rather than failing an enum', () => {
    // The rule has to agree with @ragenai/storage's own resolver, which
    // trims and treats blank as unset. A schema that rejected '' here would
    // refuse a configuration the runtime accepts.
    const withDefault = z.object({
      STORAGE_PROVIDER: blankAsUndefined(
        z.enum(['s3', 'local']).default('local'),
      ),
    });

    expect(withDefault.parse({ STORAGE_PROVIDER: '' }).STORAGE_PROVIDER).toBe(
      'local',
    );
  });
});

describe('shared fragments', () => {
  it('defaults TARGET_ENV to local, so a fresh clone needs no env at all', () => {
    expect(fragments.targetEnv.parse({}).TARGET_ENV).toBe('local');
  });

  it('rejects an unknown TARGET_ENV rather than silently treating it as local', () => {
    expect(fragments.targetEnv.safeParse({ TARGET_ENV: 'prod' }).success).toBe(
      false,
    );
  });

  it('requires DATABASE_URL to be a URL, not merely present', () => {
    expect(
      fragments.database.safeParse({ DATABASE_URL: 'postgres-host' }).success,
    ).toBe(false);
    expect(
      fragments.database.safeParse({
        DATABASE_URL: 'postgresql://postgres:pass@localhost:55432/ragen',
      }).success,
    ).toBe(true);
  });

  it('catches a scheme-less OTLP endpoint, which z.string().url() lets through', () => {
    // `new URL('localhost:4318')` does not throw — it reads `localhost:` as
    // the scheme — so plain .url() accepts the single most likely typo.
    expect(
      fragments.observability.safeParse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'localhost:4318',
      }).success,
    ).toBe(false);
    expect(
      fragments.observability.safeParse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
      }).success,
    ).toBe(true);
  });

  it('leaves observability entirely optional — it is a no-op without an endpoint (ADR-22)', () => {
    expect(fragments.observability.safeParse({}).success).toBe(true);
  });

  it('defaults storage to local, per ADR-27', () => {
    expect(fragments.storage.parse({}).STORAGE_PROVIDER).toBe('local');
  });

  it('requires LITELLM_PROXY_URL, since no app talks to a provider directly (ADR-04)', () => {
    expect(fragments.litellm.safeParse({}).success).toBe(false);
  });
});

describe('httpUrl', () => {
  const schema = z.object({ ENDPOINT: httpUrl() });

  it.each([
    'http://localhost:4318',
    'https://collector.example.com/otlp',
    'http://otel-collector.railway.internal:4318',
  ])('accepts %s', (value) => {
    expect(schema.safeParse({ ENDPOINT: value }).success).toBe(true);
  });

  it.each([
    ['localhost:4318', 'a scheme-less host:port, the most common typo'],
    ['grpc://collector:4317', 'a non-HTTP scheme'],
    ['file:///etc/passwd', 'a file URL'],
    ['not a url', 'nonsense'],
    ['', 'empty'],
  ])('rejects %j (%s)', (value) => {
    expect(schema.safeParse({ ENDPOINT: value }).success).toBe(false);
  });
});

describe('redisUrl', () => {
  const schema = fragments.redisUrl();
  const accepts = (value: string) => schema.safeParse(value).success;

  it.each([
    ['redis://localhost:56379'],
    ['rediss://x.upstash.io:6379'],
    ['redis://user:password@host:6379/2'],
  ])('accepts %s', (value) => {
    expect(accepts(value)).toBe(true);
  });

  it('accepts a scheme-less host:port, because ioredis does', () => {
    // The opposite conclusion to `httpUrl()`, deliberately. Refusing this
    // would reject a configuration the runtime handles correctly — ioredis
    // parses `localhost:56379` into host and port — which is the mistake
    // `blankAsUndefined` exists to avoid.
    expect(accepts('localhost:56379')).toBe(true);
    expect(accepts('redis')).toBe(true);
  });

  it.each([['falkor://localhost:6379'], ['http://localhost:56379']])(
    'rejects %s, which ioredis would accept and connect without TLS',
    (value) => {
      // ioredis ignores the scheme entirely: it takes host and port and
      // connects. `rediss://` is the only one that turns TLS on, so a wrong
      // scheme is silent *and* silently not-TLS — worth refusing even though
      // the client would not complain.
      expect(accepts(value)).toBe(false);
    },
  );

  it('rejects https:// in particular', () => {
    // The one someone reaches for with a managed Redis, and the one that
    // looks most like it means "encrypted".
    expect(accepts('https://x.upstash.io')).toBe(false);
  });

  it.each([[''], ['   '], ['not a url'], ['redis://host /path']])(
    'rejects %s',
    (value) => {
      expect(accepts(value)).toBe(false);
    },
  );
});
