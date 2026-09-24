const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a route parameter can be a row id at all.
 *
 * Every tenant-scoped id is a Postgres `uuid` column, and Prisma does not
 * answer "no such row" for `'xyz'` — it throws P2023 before the query runs.
 * Uncaught in a page, that took the whole panel down with "Application
 * error"; in a route handler it was a 500. Ask this first and a typo in a URL
 * is the 404 it always was.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
