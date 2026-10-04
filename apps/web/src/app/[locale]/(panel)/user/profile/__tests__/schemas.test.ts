import { describe, expect, it } from 'vitest';

import {
  PASSWORD_MIN_LENGTH,
  getChangePasswordSchema,
  getUpdateProfileSchema,
} from '../types';

/**
 * A translator that returns what it was asked for, so a test can tell which key
 * a message came from and what values it was given — and that nothing is a
 * hard-coded string in some language (#1091: these used to be Polish literals).
 */
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

const messages = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [];

describe('getUpdateProfileSchema', () => {
  const schema = getUpdateProfileSchema(t);

  it('accepts a name', () => {
    expect(schema.safeParse({ name: 'Ann' }).success).toBe(true);
  });

  it('accepts a name of exactly the maximum length', () => {
    expect(schema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true);
  });

  it('rejects an empty name with the translated message', () => {
    expect(messages(schema.safeParse({ name: '' }))).toEqual([
      ['name', 'validation.name-required'],
    ]);
  });

  it('rejects an over-long name and passes the limit to the message', () => {
    expect(messages(schema.safeParse({ name: 'a'.repeat(101) }))).toEqual([
      ['name', 'validation.name-too-long {"max":100}'],
    ]);
  });

  it('rejects a missing name', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe('getChangePasswordSchema', () => {
  const schema = getChangePasswordSchema(t);
  const valid = {
    currentPassword: 'old-password',
    newPassword: 'new-password',
    confirmPassword: 'new-password',
  };

  it('accepts a change that matches and differs from the current password', () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it('accepts passwords of exactly the minimum length', () => {
    const exact = (value: string) => value.padEnd(PASSWORD_MIN_LENGTH, 'x');

    expect(
      schema.safeParse({
        currentPassword: exact('a'),
        newPassword: exact('b'),
        confirmPassword: exact('b'),
      }).success,
    ).toBe(true);
  });

  it('rejects a short password and passes the minimum to the message', () => {
    const result = schema.safeParse({ ...valid, currentPassword: 'short' });

    expect(messages(result)).toEqual([
      ['currentPassword', 'validation.min-length {"min":8}'],
    ]);
  });

  it('rejects a confirmation that does not match, on the confirmation field', () => {
    const result = schema.safeParse({
      ...valid,
      confirmPassword: 'something-else',
    });

    expect(messages(result)).toEqual([
      ['confirmPassword', 'validation.passwords-mismatch'],
    ]);
  });

  it('rejects a new password equal to the current one, on the new-password field', () => {
    const result = schema.safeParse({
      currentPassword: 'same-password',
      newPassword: 'same-password',
      confirmPassword: 'same-password',
    });

    expect(messages(result)).toEqual([
      ['newPassword', 'validation.must-differ'],
    ]);
  });

  it('reports every problem at once, each against its own field', () => {
    const result = schema.safeParse({
      currentPassword: 'same-password',
      newPassword: 'same-password',
      confirmPassword: 'different',
    });

    expect(
      messages(result)
        .map(([path]) => path)
        .sort(),
    ).toEqual(['confirmPassword', 'newPassword']);
  });
});
