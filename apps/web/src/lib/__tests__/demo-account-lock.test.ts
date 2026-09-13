import { describe, expect, it, vi } from 'vitest';

const isSharedDemoAccount = vi.hoisted(() => vi.fn());

vi.mock('@/libs/demo-credentials', () => ({ isSharedDemoAccount }));

import {
  DEMO_ACCOUNT_LOCKED_PATHS,
  DEMO_ACCOUNT_PASSWORD_RESET_PATH,
  isDemoAccountLockedRequest,
  isDemoAccountPasswordResetRequest,
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

describe('the shared demo account password reset', () => {
  it('refuses a reset requested for the shared account', () => {
    isSharedDemoAccount.mockReturnValue(true);

    expect(
      isDemoAccountPasswordResetRequest(DEMO_ACCOUNT_PASSWORD_RESET_PATH, {
        email: 'demo@x.test',
      }),
    ).toBe(true);
  });

  it('lets anyone else recover their password', () => {
    isSharedDemoAccount.mockReturnValue(false);

    expect(
      isDemoAccountPasswordResetRequest(DEMO_ACCOUNT_PASSWORD_RESET_PATH, {
        email: 'me@x.test',
      }),
    ).toBe(false);
  });

  it('ignores a body that does not name an address', () => {
    // Better Auth validates the body itself; a request that never reaches a
    // string address is nobody's account, and must not be refused as if it
    // were the demo's.
    isSharedDemoAccount.mockReturnValue(true);
    isSharedDemoAccount.mockClear();

    for (const body of [undefined, null, {}, { email: 42 }, 'demo@x.test']) {
      expect(
        isDemoAccountPasswordResetRequest(
          DEMO_ACCOUNT_PASSWORD_RESET_PATH,
          body,
        ),
      ).toBe(false);
    }
    expect(isSharedDemoAccount).not.toHaveBeenCalled();
  });

  it('does not reach for a body on any other route', () => {
    isSharedDemoAccount.mockReturnValue(true);

    expect(
      isDemoAccountPasswordResetRequest('/reset-password', {
        email: 'demo@x.test',
      }),
    ).toBe(false);
  });

  it('is not in the session-keyed list, which has no body to read', () => {
    expect(DEMO_ACCOUNT_LOCKED_PATHS).not.toContain(
      DEMO_ACCOUNT_PASSWORD_RESET_PATH,
    );
  });
});
