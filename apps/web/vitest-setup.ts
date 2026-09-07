import { afterEach, afterAll, beforeEach, vi } from 'vitest';
// import { cleanup } from '@testing-library/react'
// import '@testing-library/jest-dom/vitest';
import '@testing-library/jest-dom';
// import matchers from '@testing-library/jest-dom/matchers';

import { toHaveNoViolations } from 'jest-axe';
// import { server } from "./src/mocks/node";

// Mock next/navigation to avoid ESM resolution issues with next-intl
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  notFound: vi.fn(),
}));

// Mock ioredis to prevent connection attempts in test/CI environments
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(() => ({
    hget: vi.fn().mockResolvedValue(null),
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue(0),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(0),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    status: 'ready',
  }));
  return { default: RedisMock, Redis: RedisMock };
});

/**
 * Mock Better Auth's browser client so no real session store is ever created.
 *
 * `createAuthClient` builds a nanostores atom for the session, and nanostores
 * schedules its unmount cleanup on a one-second `setTimeout` after the last
 * subscriber goes away (`nanostores/lifecycle`, `STORE_UNMOUNT_DELAY`). Better
 * Auth's cleanup then reaches for `window.removeEventListener` to tear down
 * its cross-tab broadcast channel.
 *
 * Any test rendering a component that calls `useSession()` therefore leaves a
 * timer behind that outlives the test file. When Vitest disposes the jsdom
 * environment before it fires, `window` is gone and the run reports
 * `ReferenceError: window is not defined` as an unhandled error — attributed
 * to whichever file happened to be running, not the one that armed it. Every
 * test passes and the job still fails, which is a miserable thing to chase:
 * it did exactly that on CI for #897, a PR touching only ESLint config.
 *
 * Only two test files mocked `@/app/hooks/use-better-auth` themselves, so the
 * rest got the real client. Mocking one module below the hook fixes all of
 * them at once and leaves those two overrides working, since a file-level
 * `vi.mock` of the hook still wins.
 *
 * The client is a memoising proxy: any property is a `vi.fn()` created once
 * and reused, so `expect(authClient.organization.setActive)` sees a stable
 * reference, and paths like `authClient.organization.addTeamMember` work
 * without enumerating every method the app happens to call.
 */
vi.mock('better-auth/react', () => {
  // Frozen module-level constants, not fresh literals per call: a hook that
  // returns a new object every render sends components into a render loop.
  const EMPTY_QUERY = Object.freeze({
    data: null,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: vi.fn(),
  });

  const createClientProxy = (): Record<string, unknown> => {
    const cache = new Map<string, unknown>();

    return new Proxy({} as Record<string, unknown>, {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }
        if (!cache.has(property)) {
          if (
            property === 'useSession' ||
            property === 'useActiveOrganization'
          ) {
            cache.set(
              property,
              vi.fn(() => EMPTY_QUERY),
            );
          } else {
            // Doubles as a namespace and a call: `organization` is reached
            // both as `authClient.organization.setActive()` and never called
            // itself, so the value has to be a function carrying properties.
            const fn = vi.fn().mockResolvedValue({ data: null, error: null });
            // Built once per property, not per access — otherwise
            // `authClient.organization.setActive` would be a different
            // function every time it is read, and no assertion on it could
            // ever hold.
            const namespace = createClientProxy();
            cache.set(
              property,
              new Proxy(fn, {
                get: (target, nested) =>
                  nested in target
                    ? Reflect.get(target, nested)
                    : namespace[nested as string],
              }),
            );
          }
        }
        return cache.get(property);
      },
    });
  };

  return { createAuthClient: vi.fn(() => createClientProxy()) };
});

expect.extend(toHaveNoViolations);

beforeEach(() => {
  // server.listen();
});

afterEach(() => {
  // cleanup();
  // server.resetHandlers();
});

afterAll(() => {
  // server.close();
});

// jsdom has no ResizeObserver, and @floating-ui (via react-tooltip, cmdk and
// Radix) calls it on mount. Ten test files each defined their own copy, so
// whether a component test passed depended on which file happened to run first
// in the same worker — CopyToClipboardButton failed intermittently for exactly
// that reason. Defined once here so the suite is order-independent.
if (!('ResizeObserver' in globalThis)) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

// jsdom implements no Pointer Events capture API and no scrollIntoView, and
// Radix needs both: its Select trigger calls `hasPointerCapture` on pointerdown
// and its listbox calls `scrollIntoView` when it moves the active option. The
// trigger renders and can be found, so the failure surfaces one step later as
// `target.hasPointerCapture is not a function`, or as an option that never
// appears — which reads like a query problem rather than a missing DOM API.
//
// Defined here rather than per file for the same reason as ResizeObserver
// above: ADR-41 is moving this app off Headless UI onto Radix, so every
// component test that follows would otherwise carry its own copy.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
