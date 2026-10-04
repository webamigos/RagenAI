import { describe, expect, it } from 'vitest';

import { getAddMemberSchema, getUpdateOrganizationSchema } from '../types';

/** See the user-profile schema test: returns the key and values it was given. */
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

const messages = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [];

describe('getUpdateOrganizationSchema', () => {
  const schema = getUpdateOrganizationSchema(t);

  it('accepts a name, including one of exactly the maximum length', () => {
    expect(schema.safeParse({ name: 'Acme' }).success).toBe(true);
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
});

describe('getAddMemberSchema', () => {
  const schema = getAddMemberSchema(t);

  it('accepts an invitation with an email and a role, and no name', () => {
    expect(
      schema.safeParse({ mode: 'invite', email: 'a@b.co', role: 'member' })
        .success,
    ).toBe(true);
  });

  it('accepts a created account that has a name', () => {
    expect(
      schema.safeParse({
        mode: 'create',
        email: 'a@b.co',
        role: 'admin',
        name: 'Ann Smith',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid email with the translated message', () => {
    expect(
      messages(
        schema.safeParse({ mode: 'invite', email: 'nope', role: 'member' }),
      ),
    ).toEqual([['email', 'validation.invalid-email']]);
  });

  it('rejects a missing or unassignable role', () => {
    // `owner` is transferred, not assigned, so it is not a valid choice here.
    for (const role of [undefined, 'owner', '']) {
      const result = schema.safeParse({
        mode: 'invite',
        email: 'a@b.co',
        role,
      });

      expect(result.success).toBe(false);
      expect(messages(result)[0]).toEqual(['role', 'validation.role-required']);
    }
  });

  it('requires a name only when creating an account', () => {
    expect(
      messages(
        schema.safeParse({ mode: 'create', email: 'a@b.co', role: 'member' }),
      ),
    ).toEqual([['name', 'validation.full-name-required']]);

    // Whitespace is not a name.
    expect(
      schema.safeParse({
        mode: 'create',
        email: 'a@b.co',
        role: 'member',
        name: '   ',
      }).success,
    ).toBe(false);
  });
});
