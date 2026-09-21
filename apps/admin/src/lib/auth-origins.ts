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

/**
 * Where `npm run admin:dev` and this workspace's `start` serve this app.
 *
 * Trusted below only outside production — and `next start` *is* production, so
 * running the built panel locally was still refused, with the same message and
 * for the same reason, after the dev case was fixed. Rather than widen the
 * policy (a real deployment serves nothing from localhost, and the exclusion is
 * right), both scripts in `apps/admin/package.json` set
 * `ADMIN_TRUSTED_ORIGINS` to this value. They only ever serve this port, and
 * the image starts the app with `node apps/admin/server.js`, so neither line
 * reaches a deployment. `apps/admin/playwright.config.ts` runs `npm run start`
 * and inherits it, which is why the suite no longer needs the variable set by
 * hand.
 */
export const LOCAL_ADMIN_ORIGIN = 'http://localhost:3200';

/** Comma- or space-separated extra origins, for a deployment behind a proxy. */
const EXTRA_ORIGINS_VAR = 'ADMIN_TRUSTED_ORIGINS';

/**
 * The origin of a configured url, or nothing if it is not a url.
 *
 * Reduced to the origin so a variable carrying a path — `.../api/auth`, which
 * is a natural thing to paste — still matches the browser's `Origin` header,
 * which never has one.
 */
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

/**
 * Every origin this app will accept an auth request from.
 *
 * Order is not significant; duplicates are removed so a deployment that sets
 * the same host in two variables does not list it twice.
 */
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
