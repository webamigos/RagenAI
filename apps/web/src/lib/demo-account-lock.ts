import { isSharedDemoAccount } from '@/libs/demo-credentials';

/**
 * Better Auth endpoints the shared demo account may not call.
 *
 * These are the routes behind "change my name", "change my password" and
 * "log out my other devices" — plus the two that would take the account away
 * altogether. The forms in `user/profile` and `settings/account` disable
 * themselves for the shared account, but a disabled button is not a gate:
 * `authClient.revokeSessions()` is one line in a browser console, and the
 * server actions call the same endpoints through `auth.api`. The hook in
 * `lib/auth.ts` is where the refusal actually lives; this list is what it
 * refuses.
 *
 * Paths are Better Auth's own, without the `/api/auth` prefix — that is what
 * `ctx.path` carries inside a hook.
 */
export const DEMO_ACCOUNT_LOCKED_PATHS = [
  '/update-user',
  '/change-password',
  '/set-password',
  '/change-email',
  '/delete-user',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
] as const;

export const DEMO_ACCOUNT_LOCKED_MESSAGE =
  'This is the shared demo account. Its name, password and sessions cannot be changed.';

/**
 * Should this request be refused because it would change the shared demo
 * account? True only when both halves hold: the path is one of the locked
 * ones, and the caller is the published account. Anyone else on the demo
 * deployment — a salesperson with their own login — keeps every route.
 */
export function isDemoAccountLockedRequest(
  path: string,
  email: string | null | undefined,
): boolean {
  if (!isSharedDemoAccount(email)) {
    return false;
  }

  return (DEMO_ACCOUNT_LOCKED_PATHS as readonly string[]).includes(path);
}
