import type { z } from 'zod';

/**
 * Everything an app needs to know about one bad environment variable.
 */
export interface EnvIssue {
  /** The variable's name, or the group name for a cross-field rule. */
  name: string;
  message: string;
}

export interface EnvFailure {
  ok: false;
  issues: EnvIssue[];
  /**
   * Every issue on its own line, ready to print. Built here rather than at
   * each call site so the five apps report a misconfiguration identically.
   */
  report: string;
}

export interface EnvSuccess<T> {
  ok: true;
  env: T;
}

export type EnvResult<T> = EnvSuccess<T> | EnvFailure;

/**
 * `process.env` is the default source, but every function here takes it as an
 * argument so the rules can be tested without mutating the real environment.
 */
export type EnvSource = Record<string, string | undefined>;

function toIssues(error: z.ZodError): EnvIssue[] {
  return error.issues.map((issue) => ({
    name: issue.path.length > 0 ? issue.path.join('.') : '(environment)',
    message: issue.message,
  }));
}

function toReport(issues: EnvIssue[]): string {
  const lines = issues.map(({ name, message }) => `  - ${name}: ${message}`);
  return [
    `Environment validation failed (${issues.length} problem${issues.length === 1 ? '' : 's'}):`,
    ...lines,
  ].join('\n');
}

/**
 * Validate an environment against a schema, collecting **every** problem.
 *
 * Deliberately non-throwing. The caller decides what a bad environment means,
 * and the two answers in this repo genuinely differ: a worker or an API server
 * should refuse to start, while apps/web must still boot — it serves the setup
 * page that tells a self-hosted operator what to fix, and a process that exits
 * cannot render the instructions for fixing it.
 *
 * Reporting all issues at once rather than the first is the point. A boot loop
 * that reveals one missing variable per restart is how a ten-minute setup
 * becomes an afternoon.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: EnvSource = process.env,
): EnvResult<z.infer<T>> {
  const result = schema.safeParse(source);

  if (result.success) {
    return { ok: true, env: result.data as z.infer<T> };
  }

  const issues = toIssues(result.error);
  return { ok: false, issues, report: toReport(issues) };
}

/**
 * `parseEnv` for a process that has no useful behaviour without a valid
 * environment: print the whole report and exit non-zero.
 *
 * Writes to the console rather than to a logger on purpose. This runs before
 * instrumentation is up — that is the point of it running at boot — and a
 * misconfiguration that exits silently is the most expensive kind to diagnose,
 * because the container just restarts.
 */
export function parseEnvOrExit<T extends z.ZodType>(
  schema: T,
  source: EnvSource = process.env,
  exit: (code: number) => never = process.exit.bind(process) as (
    code: number,
  ) => never,
): z.infer<T> {
  const result = parseEnv(schema, source);

  if (!result.ok) {
    // eslint-disable-next-line no-console -- runs before any logger exists, by design
    console.error(result.report);
    exit(1);
  }

  return result.env;
}
