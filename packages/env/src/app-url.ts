import { type z } from 'zod';

/**
 * The public origin users reach this installation at — the one place it is
 * resolved.
 *
 * `APP_URL` is the name. It used to be `BETTER_AUTH_URL`, which says which
 * library reads the value rather than what it is
 * (docs/specs/2026-10-18-app-url-replaces-better-auth-url.md). v2.58.0 read
 * the old name as a fallback; Phase C removed the fallback. The old name is
 * now read in exactly one place, {@link appUrlRenameRule}, and only to say
 * that it was renamed — never as a value.
 */

export const APP_URL_VARIABLE = 'APP_URL' as const;

/** The name `APP_URL` replaced. Detected by {@link appUrlRenameRule}, never read as a value. */
export const RENAMED_APP_URL_VARIABLE = 'BETTER_AUTH_URL' as const;

/**
 * The configured origin, or `undefined` when `APP_URL` is unset or blank.
 * A trailing slash is stripped, because every caller appends an absolute path.
 */
export function resolveAppUrl(
  // The index signature lets a parsed env (numbers included) and
  // `process.env` both pass.
  env: {
    readonly APP_URL?: string;
    readonly [name: string]: unknown;
  } = process.env,
): string | undefined {
  const value = env[APP_URL_VARIABLE]?.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

/**
 * Report an install that still sets only the old name.
 *
 * Without this, removing the fallback would fail quietly: Better Auth would
 * sign links with its localhost default, emails would stop going out (their
 * mailer catches and logs) and the MCP OAuth issuer would be missing — none of
 * it naming the variable. With it, every app's boot-time check says exactly
 * what to rename. Both set is fine: `APP_URL` wins and the old one is inert.
 */
export function appUrlRenameRule(
  env: { readonly APP_URL?: string; readonly BETTER_AUTH_URL?: string },
  ctx: z.RefinementCtx,
): void {
  if (env[APP_URL_VARIABLE]?.trim() || !env[RENAMED_APP_URL_VARIABLE]?.trim()) {
    return;
  }
  ctx.addIssue({
    code: 'custom',
    path: [APP_URL_VARIABLE],
    message: `${RENAMED_APP_URL_VARIABLE} was renamed to ${APP_URL_VARIABLE} in v2.58.0 and is no longer read. Rename it to ${APP_URL_VARIABLE}, keeping the same value.`,
  });
}
