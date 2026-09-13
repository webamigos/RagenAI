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

/**
 * The one password-recovery route, refused for the shared account.
 *
 * Separate from the list above because it has no session to key on: it is
 * reached by a signed-out stranger and names its subject in the request body.
 * `/reset-password` needs a token that only this route issues, so refusing
 * this one means no token for the shared account is ever minted — there is
 * nothing further down the flow left to block.
 */
export const DEMO_ACCOUNT_PASSWORD_RESET_PATH = '/request-password-reset';

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

/**
 * Should this password-reset request be refused? True when it names the
 * published account — anyone else on the demo deployment recovers their
 * password as usual.
 *
 * The email arrives as untyped request-body JSON, so this narrows rather than
 * trusting the caller's shape: a non-string address is nobody's account and
 * falls through to Better Auth's own validation.
 */
export function isDemoAccountPasswordResetRequest(
  path: string,
  body: unknown,
): boolean {
  if (path !== DEMO_ACCOUNT_PASSWORD_RESET_PATH) {
    return false;
  }

  const email =
    typeof body === 'object' && body !== null && 'email' in body
      ? (body as { email: unknown }).email
      : undefined;

  return typeof email === 'string' && isSharedDemoAccount(email);
}
