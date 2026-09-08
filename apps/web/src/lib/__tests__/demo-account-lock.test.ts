import { describe, expect, it, vi } from 'vitest';

const isSharedDemoAccount = vi.hoisted(() => vi.fn());

vi.mock('@/libs/demo-credentials', () => ({ isSharedDemoAccount }));

import {
  DEMO_ACCOUNT_LOCKED_PATHS,
  isDemoAccountLockedRequest,
} from '../demo-account-lock';

describe('the shared demo account lock', () => {
  it('covers the routes behind name, password and sessions, and nothing else', () => {
    // These are the endpoints the forms in user/profile and settings/account
    // call, plus the two that would remove the account. Sign-in, sign-out and
    // the session read stay open — a lock that blocked sign-out would trap the
    // visitor in the demo.
    expect([...DEMO_ACCOUNT_LOCKED_PATHS].sort()).toEqual(
      [
        '/update-user',
        '/change-password',
        '/set-password',
        '/change-email',
        '/delete-user',
        '/revoke-session',
        '/revoke-sessions',
        '/revoke-other-sessions',
      ].sort(),
    );
    expect(DEMO_ACCOUNT_LOCKED_PATHS).not.toContain('/sign-out');
    expect(DEMO_ACCOUNT_LOCKED_PATHS).not.toContain('/get-session');
  });

  it('refuses a locked route for the shared account', () => {
    isSharedDemoAccount.mockReturnValue(true);

    expect(isDemoAccountLockedRequest('/change-password', 'demo@x.test')).toBe(
      true,
    );
    expect(isDemoAccountLockedRequest('/revoke-sessions', 'demo@x.test')).toBe(
      true,
    );
  });

  it('lets the shared account use every other route', () => {
    isSharedDemoAccount.mockReturnValue(true);

    expect(isDemoAccountLockedRequest('/sign-out', 'demo@x.test')).toBe(false);
    expect(isDemoAccountLockedRequest('/get-session', 'demo@x.test')).toBe(
      false,
    );
  });

  it('lets anyone else use the locked routes', () => {
    // The lock is on one account, not on the deployment.
    isSharedDemoAccount.mockReturnValue(false);

    expect(isDemoAccountLockedRequest('/change-password', 'me@x.test')).toBe(
      false,
    );
    expect(isDemoAccountLockedRequest('/update-user', undefined)).toBe(false);
  });
});
