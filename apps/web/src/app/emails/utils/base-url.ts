/**
 * The absolute origin that links in outgoing emails point at.
 *
 * This used to be a hardcoded `TARGET_ENV` → URL table naming the vendor's own
 * staging and production hosts. On any other installation that is wrong in two
 * ways: `TARGET_ENV=production` sent every invitation link to the vendor's
 * instance (so invitees landed on the wrong deployment, carrying someone
 * else's invitation token), and an unset `TARGET_ENV` — the likelier case —
 * produced the literal string `undefined/accept-invitation?token=…`.
 *
 * `BETTER_AUTH_URL` is the source of truth because Better Auth already builds
 * the magic-link, password-reset and email-verification URLs from it
 * (`baseURL` in `src/lib/auth.ts`), so every other link in every other email
 * this app sends already resolves this way. It is also read at runtime, unlike
 * `NEXT_PUBLIC_APP_URL`, which Next inlines at build time and which therefore
 * cannot be set by an operator running a prebuilt image — that one stays as a
 * fallback for installs that only configured it.
 */
const LOCAL_FALLBACK = 'http://localhost:3000';

/**
 * `TARGET_ENV` values that mean "not a deployment" (see `.env.example` for the
 * full list). Only these get the localhost guess; `staging`/`production` must
 * say where they actually live.
 */
const NON_DEPLOYED_ENVS = new Set(['local', 'test', 'e2e', 'ci']);

export function getBaseUrl(): string {
  // Blank counts as unset per variable, not just per group: `BETTER_AUTH_URL=`
  // left empty in an env file must not shadow a configured NEXT_PUBLIC_APP_URL.
  // Same rule as the first-run environment inspector's `isSet`.
  const configured = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].find((value) => typeof value === 'string' && value.trim() !== '');

  if (configured !== undefined) {
    // Callers append absolute paths (`${getBaseUrl()}/accept-invitation`), so
    // a configured trailing slash would otherwise produce a double slash.
    return configured.trim().replace(/\/+$/, '');
  }

  const targetEnv = process.env.TARGET_ENV?.trim();
  if (targetEnv !== undefined && NON_DEPLOYED_ENVS.has(targetEnv)) {
    return LOCAL_FALLBACK;
  }

  // Throwing beats returning a placeholder: every caller is inside a mailer
  // that catches, logs and reports the failed send, so a misconfigured install
  // gets a named variable in its logs instead of delivering a dead link.
  throw new Error(
    'BETTER_AUTH_URL (or NEXT_PUBLIC_APP_URL) must be set — email links have no origin to point at.',
  );
}
