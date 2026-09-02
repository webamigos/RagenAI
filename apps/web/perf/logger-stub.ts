/**
 * Stand-in for `src/app/lib/utils/logger`.
 *
 * The real module picks its implementation with CommonJS `require()`, which
 * resolves under webpack but not under plain ESM — so importing anything that
 * touches it (the Prisma singleton does, via the tenant-scope guard) fails in
 * vitest. Aliased in `vitest.perf.config.ts`.
 *
 * It also records what it was told, which turns the tenant-scope guard's
 * warnings into something a test can assert on: the guard only warns, so
 * without capturing it here a query missing its org filter would run silently.
 */

export type Captured = { level: string; args: unknown[] };

export const captured: Captured[] = [];

const record =
  (level: string) =>
  (...args: unknown[]) => {
    captured.push({ level, args });
  };

export const logger = {
  trace: record('trace'),
  debug: record('debug'),
  info: record('info'),
  warn: record('warn'),
  error: record('error'),
  fatal: record('fatal'),
  child: () => logger,
};

/** Warnings the tenant-scope guard emitted, as readable strings. */
export function tenantScopeWarnings(): string[] {
  return captured
    .filter((c) => c.level === 'warn')
    .map((c) => JSON.stringify(c.args))
    .filter((s) => /tenant|organization|org.?scope/i.test(s));
}

export function resetCaptured() {
  captured.length = 0;
}

export default logger;
