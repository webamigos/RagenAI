import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV = { ...process.env };

/**
 * The credentials are read at module load, so each case sets the environment
 * and imports fresh — the same thing Next does at build time.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return import('../demo-credentials');
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_EMAIL;
  delete process.env.NEXT_PUBLIC_DEMO_PASSWORD;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe('isSharedDemoAccount', () => {
  it('is false for everyone when no demo account is published', async () => {
    // The self-hosted case: nothing is locked, whatever the address.
    const { isSharedDemoAccount } = await load({});

    expect(isSharedDemoAccount('someone@example.com')).toBe(false);
  });

  it('is false when only one of the two variables is set', async () => {
    // Presence of *both* is the gate, the same rule the sign-in notice uses.
    const { isSharedDemoAccount } = await load({
      NEXT_PUBLIC_DEMO_EMAIL: 'showcase@example.com',
    });

    expect(isSharedDemoAccount('showcase@example.com')).toBe(false);
  });

  it('matches the published address and nobody else', async () => {
    const { isSharedDemoAccount } = await load({
      NEXT_PUBLIC_DEMO_EMAIL: 'showcase@example.com',
      NEXT_PUBLIC_DEMO_PASSWORD: 'published-password',
    });

    expect(isSharedDemoAccount('showcase@example.com')).toBe(true);
    // A salesperson with their own login on the same deployment stays free.
    expect(isSharedDemoAccount('sales@example.com')).toBe(false);
    expect(isSharedDemoAccount(null)).toBe(false);
    expect(isSharedDemoAccount(undefined)).toBe(false);
  });

  it('ignores case and surrounding whitespace', async () => {
    // Better Auth lower-cases addresses; an operator typing the variable may not.
    const { isSharedDemoAccount } = await load({
      NEXT_PUBLIC_DEMO_EMAIL: 'Showcase@Example.com ',
      NEXT_PUBLIC_DEMO_PASSWORD: 'published-password',
    });

    expect(isSharedDemoAccount('showcase@example.com')).toBe(true);
    expect(isSharedDemoAccount('  SHOWCASE@EXAMPLE.COM')).toBe(true);
  });
});
