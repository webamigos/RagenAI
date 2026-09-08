/**
 * Whether this installation lets people create their own account.
 *
 * Declared here rather than in either app because both need it and neither
 * owns it: `apps/web` enforces it at sign-up, `apps/admin` is where an
 * administrator turns it on (ADR-33 — one declaration, never a copy per app).
 *
 * **Closed is the default**, and deliberately so. A fresh installation is
 * reachable before its operator has configured anything, and an open sign-up
 * form on a URL nobody has secured yet hands the first stranger an account
 * and an organization. The setting is absent from a new database, and absent
 * has to mean closed — a default that fails safe rather than one that fails
 * convenient.
 *
 * Stored in the platform `Settings` table, which is a string key/value store,
 * so the value is the string 'true' or 'false' and anything else — a typo, a
 * hand-edited row, a half-written migration — reads as closed.
 */
export const REGISTRATION_ENABLED_KEY = 'registration_enabled';

/** What an installation does before anyone has decided. */
export const REGISTRATION_ENABLED_BY_DEFAULT = false;

/**
 * Reads the stored value, which is a string or nothing at all.
 *
 * Only the exact string 'true' opens registration. `Boolean('false')` is
 * `true`, which is the mistake this function exists to make impossible.
 */
export function registrationIsEnabled(
  storedValue: string | null | undefined,
): boolean {
  if (storedValue === null || storedValue === undefined) {
    return REGISTRATION_ENABLED_BY_DEFAULT;
  }
  return storedValue === 'true';
}

/** The string to persist for a given choice. */
export function registrationSettingValue(enabled: boolean): string {
  return enabled ? 'true' : 'false';
}
