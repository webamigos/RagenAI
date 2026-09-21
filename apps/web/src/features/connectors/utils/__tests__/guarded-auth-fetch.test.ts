/**
 * The OAuth hops run before any MCP session exists, so the guarded transport
 * is not in the path — `mcpAuth` has to be handed the policy itself, or
 * discovery and the token exchange go out on the global fetch with only a
 * hostname check behind them.
 */
import { describe, expect, it, vi } from 'vitest';

const close = vi.fn().mockResolvedValue(undefined);
const guardedFetch = vi.fn();
const createGuardedFetch = vi.fn().mockReturnValue({
  fetch: guardedFetch,
  close,
});
vi.mock('@ragenai/connector-guard', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    createGuardedFetch: (...args: unknown[]) =>
      createGuardedFetch(...args) as unknown,
  };
});

const { guardedAuthFetch } = await import('../guarded-auth-fetch');

import type { ProviderDefinition } from '../../contracts/connector.types';

const definition = (addressGuard?: {
  allowPrivate: boolean;
}): ProviderDefinition => ({ addressGuard }) as ProviderDefinition;

describe('guardedAuthFetch', () => {
  it('hands mcpAuth a guarded fetch for an operator-typed address', () => {
    const { fetchFn } = guardedAuthFetch(definition({ allowPrivate: false }));

    expect(fetchFn).toBe(guardedFetch);
  });

  it('leaves a deployer-controlled endpoint on the global fetch', () => {
    const { fetchFn } = guardedAuthFetch(definition(undefined));

    expect(fetchFn).toBeUndefined();
  });

  it('carries the entry allowsPrivateAddress setting into the policy', () => {
    guardedAuthFetch(definition({ allowPrivate: true }));

    const [options] = createGuardedFetch.mock.calls.at(-1) as [
      { isBlockedAddress: (address: string) => boolean },
    ];
    expect(options.isBlockedAddress('10.0.0.5')).toBe(false);
    expect(options.isBlockedAddress('169.254.169.254')).toBe(true);
  });

  it('is closeable either way, so the caller needs no branch', async () => {
    await expect(
      guardedAuthFetch(definition(undefined)).close(),
    ).resolves.toBeUndefined();

    await guardedAuthFetch(definition({ allowPrivate: false })).close();
    expect(close).toHaveBeenCalled();
  });
});
