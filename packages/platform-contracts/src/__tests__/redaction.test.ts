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
