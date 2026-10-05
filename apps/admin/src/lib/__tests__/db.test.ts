import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('admin prisma proxy', () => {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it('answers the Better Auth schema-check probe without building a client', async () => {
    const { prisma } = await import('../db');

    // `@better-auth/prisma-adapter` reads this inside `betterAuth()`; a throw
    // here fails every build and test that imports auth.ts without a DB URL.
    expect(
      (prisma as unknown as Record<string, unknown>)._runtimeDataModel,
    ).toBeUndefined();
  });

  it('still refuses a real query without DATABASE_URL', async () => {
    const { prisma } = await import('../db');

    expect(() => prisma.user).toThrow('Missing DATABASE_URL');
  });
});
