/**
 * How long one process trusts a branding read.
 *
 * Every panel render, sign-in page and email asks for the branding, and it
 * changes perhaps once in an install's life. A save made through apps/web
 * (the only writer — see `update-instance-branding-command.ts`) clears the
 * cache at once in the process that handled it; this window is how long
 * another replica, or a feature-key change in `apps/admin`, takes to show.
 */
export const BRANDING_CACHE_TTL_MS = 60_000;

/** After a failed read: retry soon, but not on every request of a busy page. */
export const BRANDING_FAILURE_TTL_MS = 10_000;

/** The single row's primary key. The migration's CHECK holds it to this. */
export const INSTANCE_BRANDING_ID = 1;

/** Where the panel, the sign-in pages and the emails fetch the logo. */
export const LOGO_ROUTE = '/api/branding/logo';

/** The storage prefix every uploaded logo lives under. */
export const LOGO_STORAGE_PREFIX = 'instance-branding/';
