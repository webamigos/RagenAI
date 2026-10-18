/**
 * The public origin users reach this installation at — the one place it is
 * resolved.
 *
 * `APP_URL` is the name. It used to be `BETTER_AUTH_URL`, which says which
 * library reads the value rather than what it is, and operators reasonably
 * took it for something auth-internal and left it at `localhost` — which
 * breaks every invitation, reset and verification link
 * (docs/specs/2026-10-18-app-url-replaces-better-auth-url.md).
 *
 * The old name is still read, after the new one, so no install has to be
 * reconfigured for this to land. It is read *here and nowhere else* —
 * `tests/architecture/app-url-is-resolved-in-one-place.test.ts` fails on any
 * other read — which is what makes dropping it later a one-line change.
 *
 * `APP_URL` first, not the legacy name: it is the one meant to win, and the
 * web image's build stage carries a placeholder for the legacy name that must
 * never shadow a value an operator set.
 */

/** Read only as {@link resolveAppUrl}'s fallback. Remove in Phase C. */
export const LEGACY_APP_URL_VARIABLE = 'BETTER_AUTH_URL' as const;

export const APP_URL_VARIABLE = 'APP_URL' as const;

let warned = false;

/**
 * The configured origin, or `undefined` when neither name is set.
 *
 * Blank counts as unset per variable: `APP_URL=` left empty in an env file
 * must not shadow a configured legacy value. A trailing slash is stripped,
 * because every caller appends an absolute path.
 */
export function resolveAppUrl(
  // The index signature lets a parsed env (numbers included) and
  // `process.env` both pass; only the two names below are read.
  env: {
    readonly APP_URL?: string;
    readonly BETTER_AUTH_URL?: string;
    readonly [name: string]: unknown;
  } = process.env,
): string | undefined {
  const current = env[APP_URL_VARIABLE]?.trim();
  if (current) {
    return current.replace(/\/+$/, '');
  }

  const legacy = env[LEGACY_APP_URL_VARIABLE]?.trim();
  if (!legacy) {
    return undefined;
  }

  // Once per process, and never fatal: apps/web must keep serving the setup
  // page whatever its environment says, and a renamed variable is a nudge.
  if (!warned) {
    warned = true;
    // eslint-disable-next-line no-console -- a config read has no logger, by design
    console.warn(
      `[config] ${LEGACY_APP_URL_VARIABLE} is deprecated — rename it to ${APP_URL_VARIABLE}. It is still read, for now.`,
    );
  }
  return legacy.replace(/\/+$/, '');
}

/** Test seam: the warning is once per process, and tests share one. */
export function resetAppUrlWarningForTests(): void {
  warned = false;
}
