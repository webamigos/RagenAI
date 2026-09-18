import { setPublicRuntimeConfigForTests } from '@/config/public-runtime-config';
import { describe, expect, it, vi } from 'vitest';

/**
 * The credentials come from the configuration the server renders into the
 * document, so each case installs one and imports fresh. It used to set
 * `process.env` and lean on Next inlining it at build time — which is exactly
 * what stopped, so one image can be published and configured per install.
 */
async function load(env: Parameters<typeof setPublicRuntimeConfigForTests>[0]) {
  vi.resetModules();
  setPublicRuntimeConfigForTests(env);
  return import('../demo-credentials');
}

describe('isSharedDemoAccount', () => {
  it('is false for everyone when no demo account is published', async () => {
    // The self-hosted case: nothing is locked, whatever the address.
    const { isSharedDemoAccount } = await load({});

    expect(isSharedDemoAccount('someone@example.com')).toBe(false);
  });

  it('is false when only one of the two variables is set', async () => {
    // Presence of *both* is the gate, the same rule the sign-in notice uses.
    const { isSharedDemoAccount } = await load({
      demoEmail: 'showcase@example.com',
    });

    expect(isSharedDemoAccount('showcase@example.com')).toBe(false);
  });

  it('matches the published address and nobody else', async () => {
    const { isSharedDemoAccount } = await load({
      demoEmail: 'showcase@example.com',
      demoPassword: 'published-password',
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
      demoEmail: 'Showcase@Example.com ',
      demoPassword: 'published-password',
    });

    expect(isSharedDemoAccount('showcase@example.com')).toBe(true);
    expect(isSharedDemoAccount('  SHOWCASE@EXAMPLE.COM')).toBe(true);
  });
});
