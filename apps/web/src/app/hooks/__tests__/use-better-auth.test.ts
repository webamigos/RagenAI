import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from 'better-auth/react';

import { authClient, useSession } from '../use-better-auth';

/**
 * Guards the mock in `vitest-setup.ts`, not the hook.
 *
 * The real `createAuthClient` builds a nanostores session atom, and nanostores
 * schedules its unmount cleanup on a one-second timer after the last
 * subscriber leaves. Better Auth's cleanup then touches
 * `window.removeEventListener`. If Vitest disposes the jsdom environment
 * before that fires, the run reports `ReferenceError: window is not defined`
 * as an unhandled error, blamed on whichever file happened to be running —
 * every test green, job red.
 *
 * That is not reproducible on demand: it depends on how the suite is
 * scheduled, and it has shown up on CI while three local runs (including with
 * `--coverage`, the command CI uses) stayed clean. So there is nothing to
 * assert about the symptom. What can be asserted is that the mechanism is
 * switched off — that no real client is ever constructed — which is what
 * these tests pin down, so removing the setup mock fails here with a reason
 * rather than resurfacing as an intermittent red build weeks later.
 */
describe('the Better Auth client is mocked in unit tests', () => {
  it('never constructs a real client', () => {
    expect(vi.isMockFunction(createAuthClient)).toBe(true);
  });

  it('exposes a session hook that creates no store', () => {
    // The real `useSession` subscribes to the nanostores atom, which is the
    // subscription whose teardown arms the timer.
    expect(vi.isMockFunction(useSession)).toBe(true);
    expect(useSession()).toMatchObject({ data: null, isPending: false });
  });

  it('keeps a stable reference for a nested namespace method', () => {
    // The proxy memoises, so an assertion on a method survives being read
    // twice. Without this, `expect(authClient.organization.setActive)` would
    // watch a different function than the code called.
    expect(authClient.organization.setActive).toBe(
      authClient.organization.setActive,
    );
  });
});
