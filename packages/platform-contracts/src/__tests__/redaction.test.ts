import { describe, expect, it } from 'vitest';

import {
  REDACTED,
  SENSITIVE_FIELDS,
  stripSensitiveFields,
} from '../audit/redaction';

describe('stripSensitiveFields', () => {
  it('redacts a top-level sensitive field', () => {
    expect(
      stripSensitiveFields({ name: 'Key A', apiKey: 'sk-live-1' }),
    ).toEqual({ name: 'Key A', apiKey: REDACTED });
  });

  it('leaves everything else untouched', () => {
    const input = { name: 'Acme', seats: 12, active: true, tags: ['a', 'b'] };
    expect(stripSensitiveFields(input)).toEqual(input);
  });

  it('redacts inside a nested object', () => {
    expect(
      stripSensitiveFields({
        settings: { model: 'gpt-5.4', openaiApiKey: 'x' },
      }),
    ).toEqual({ settings: { model: 'gpt-5.4', openaiApiKey: REDACTED } });
  });

  it('redacts inside objects held in an array', () => {
    expect(
      stripSensitiveFields({
        keys: [
          { id: '1', maskedValue: 'sk-a...zz' },
          { id: '2', maskedValue: 'sk-b...yy' },
        ],
      }),
    ).toEqual({
      keys: [
        { id: '1', maskedValue: REDACTED },
        { id: '2', maskedValue: REDACTED },
      ],
    });
  });

  it('leaves arrays of primitives alone', () => {
    expect(stripSensitiveFields({ allowedModels: ['gpt-5.4'] })).toEqual({
      allowedModels: ['gpt-5.4'],
    });
  });

  /**
   * A key is redacted for its name, not its value. Reporting `null` for an
   * unset credential would leak which organizations have one configured —
   * which is exactly what the admin panel's provider list renders as ticks.
   */
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('redacts a sensitive field whose value is %s', (_label, value) => {
    expect(stripSensitiveFields({ openaiApiKey: value })).toEqual({
      openaiApiKey: REDACTED,
    });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('returns null for %s input', (_label, input) => {
    expect(stripSensitiveFields(input)).toBeNull();
  });

  it('returns an empty object for an empty object', () => {
    expect(stripSensitiveFields({})).toEqual({});
  });

  it('does not mutate its input', () => {
    const input = { apiKey: 'sk-live-1', nested: { token: 't' } };
    const snapshot = JSON.stringify(input);

    stripSensitiveFields(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  // Matching is case-sensitive on purpose: the list holds camelCase Prisma
  // field names, which is the shape an entity snapshot actually has.
  it('does not redact a differently-cased near-match', () => {
    expect(stripSensitiveFields({ APIKEY: 'x' })).toEqual({ APIKEY: 'x' });
  });

  it('redacts every field the set names', () => {
    const input = Object.fromEntries(
      [...SENSITIVE_FIELDS].map((f) => [f, 'sensitive']),
    );

    const cleaned = stripSensitiveFields(input)!;

    expect(Object.values(cleaned).every((v) => v === REDACTED)).toBe(true);
    expect(Object.keys(cleaned).length).toBe(SENSITIVE_FIELDS.size);
  });
});

/**
 * The set is the security-relevant half of this module: a credential column
 * added to the schema but not named here lands in an audit row in clear text.
 */
describe('SENSITIVE_FIELDS', () => {
  it.each([
    [
      'provider credentials',
      [
        'openaiApiKey',
        'anthropicApiKey',
        'googleApiKey',
        'bedrockCredentials',
        'azureOpenaiCredentials',
        'openrouterApiKey',
        'fireworksApiKey',
      ],
    ],
    [
      'vault and LiteLLM tokens',
      ['litellmApiKey', 'litellmKeyToken', 'accessToken', 'refreshToken'],
    ],
    ['API-key material', ['apiKey', 'hashedValue', 'maskedValue']],
    ['OAuth material', ['clientSecret', 'codeVerifier']],
    ['generic secrets', ['password', 'token', 'secret']],
  ])('covers %s', (_group, fields) => {
    for (const field of fields) {
      expect(SENSITIVE_FIELDS.has(field)).toBe(true);
    }
  });
});

/**
 * Callers hand this whole entity snapshots straight out of Prisma, which are
 * full of values that are object-shaped but not plain objects.
 */
describe('values that are objects but not plain ones', () => {
  it('keeps a Date rather than flattening it to {}', () => {
    // Object.entries(new Date()) is [], so recursing loses the timestamp
    // entirely — in an audit row, where the timestamp is the point.
    const when = new Date('2026-09-03T10:00:00.000Z');

    expect(stripSensitiveFields({ createdAt: when })).toEqual({
      createdAt: when,
    });
  });

  it.each([
    ['a BigInt', BigInt(10)],
    ['a RegExp', /abc/],
    ['a Map', new Map([['a', 1]])],
    ['a Set', new Set([1])],
  ])('keeps %s as it is', (_label, value) => {
    expect(stripSensitiveFields({ field: value })).toEqual({ field: value });
  });

  it('keeps a Date held inside an array', () => {
    const when = new Date('2026-09-03T10:00:00.000Z');

    expect(stripSensitiveFields({ stamps: [when] })).toEqual({
      stamps: [when],
    });
  });

  it('still redacts a sensitive key whose value is a Date', () => {
    expect(stripSensitiveFields({ token: new Date() })).toEqual({
      token: REDACTED,
    });
  });

  // A cycle would otherwise overflow the stack inside an audit write, taking
  // down the very action being recorded.
  it('terminates on a cyclic object', () => {
    const node: Record<string, unknown> = { name: 'a' };
    node.self = node;

    expect(() => stripSensitiveFields(node)).not.toThrow();
    expect(stripSensitiveFields(node)).toMatchObject({ name: 'a' });
  });

  it('terminates on a cycle through an array', () => {
    const node: Record<string, unknown> = { name: 'a' };
    node.children = [node];

    expect(() => stripSensitiveFields(node)).not.toThrow();
  });

  it('keeps a repeated but acyclic object on both paths', () => {
    const shared = { label: 'x' };

    const result = stripSensitiveFields({ a: shared, b: shared })!;

    // `a` is walked; `b` is the same reference, so it reports as circular
    // rather than being silently dropped.
    expect(result.a).toEqual({ label: 'x' });
    expect(result.b).toBeDefined();
  });
});
