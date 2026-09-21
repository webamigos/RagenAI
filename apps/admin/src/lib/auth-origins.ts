/**
 * The origins Better Auth will accept a request from in this app.
 *
 * Why this exists at all: `betterAuth()` here declared no `baseURL` and no
 * `trustedOrigins`, so it fell back to `BETTER_AUTH_URL` — and AGENTS.md says
 * one `.env.local` at the repository root serves every app. That variable holds
 * a single origin, and the root file names apps/web's. Signing in to the admin
 * panel on `:3200` then fails with **"Sign-in failed: Invalid origin"**, a
 * message that names neither the variable nor the port, on a panel that has no
 * other way in. `admin-e2e.yml` sets `BETTER_AUTH_URL` per app, which is why CI
 * never saw it.
 *
 * The fix is deliberately not "override `BETTER_AUTH_URL`": a deployment that
 * points it at the real admin host is right, and taking that over would break
 * it. Trusting this app's *own* origin in addition is enough — sign-in here is
 * e-mail and password with sign-up disabled, so nothing depends on `baseURL`
 * for a redirect or an e-mail link.
 */

/** Where `npm run admin:dev` and `npm run admin:start` serve this app. */
export const LOCAL_ADMIN_ORIGIN = 'http://localhost:3200';

/** Comma- or space-separated extra origins, for a deployment behind a proxy. */
const EXTRA_ORIGINS_VAR = 'ADMIN_TRUSTED_ORIGINS';

function originOf(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    // A malformed value is dropped rather than thrown on: this runs at module
    // load, and refusing to boot the panel over a stray character would be a
    // worse failure than the one being fixed.
    return undefined;
  }
}

export function adminTrustedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const origins = [
    ...(env[EXTRA_ORIGINS_VAR] ?? '')
      .split(/[\s,]+/)
      .map((candidate) => originOf(candidate)),
    originOf(env.BETTER_AUTH_URL),
    // Only outside production. In a real deployment nothing is served from
    // localhost, and an origin on the trusted list is one the CSRF check stops
    // asking about.
    env.NODE_ENV === 'production' ? undefined : LOCAL_ADMIN_ORIGIN,
  ].filter((origin): origin is string => Boolean(origin));

  return [...new Set(origins)];
}
