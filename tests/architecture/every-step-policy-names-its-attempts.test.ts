import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every `ctx.steps({...})` must say how many attempts it wants.
 *
 * The two runtimes disagree about what silence means, and only one of them can
 * be honest about it. Temporal retries an activity **forever** when
 * `maximumAttempts` is unset, which is a reasonable default for an engine that
 * keeps the run durable and visible. BullMQ's adapter runs the retry loop
 * in-process, where "forever" is a job that never finishes and never fails
 * while holding and renewing its lock — invisible except as a worker that
 * looks busy.
 *
 * The adapter therefore caps an unspecified count (`DEFAULT_MAX_ATTEMPTS`),
 * and this test keeps that cap unreachable: as long as every policy names its
 * own number, the two engines agree, and the disagreement stays a floor under
 * a mistake rather than a difference in behaviour nobody chose.
 *
 * Text rather than the AST, which is this repository's idiom for architecture
 * tests — one test speaks for the whole tree without a compiler pass per file.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const HANDLERS = join(ROOT, 'apps', 'worker', 'src', 'handlers');

const handlerFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : handlerFiles(path);
    }
    return /\.ts$/.test(entry) ? [path] : [];
  });

/** `ctx.steps<...>({ ... })` and the object literal that follows it. */
const STEP_CALL = /ctx\s*\.\s*steps\s*(?:<[^>]*>)?\s*\(/g;

function policyBodies(source: string): string[] {
  const bodies: string[] = [];

  for (const match of source.matchAll(STEP_CALL)) {
    let depth = 0;
    const from = match.index + match[0].length;

    for (let i = from; i < source.length; i++) {
      const char = source[i];
      if (char === '(' || char === '{') {
        depth += 1;
      } else if (char === '}' || char === ')') {
        if (depth === 0) {
          bodies.push(source.slice(from, i));
          break;
        }
        depth -= 1;
      }
    }
  }

  return bodies;
}

describe('every step policy names its own attempt count', () => {
  const files = handlerFiles(HANDLERS);

  it('finds the handlers it is supposed to be guarding', () => {
    // A walk that matched nothing would make the assertion below pass for the
    // wrong reason — the failure mode this repository has paid for twice.
    const calls = files.flatMap((file) =>
      policyBodies(readFileSync(file, 'utf8')),
    );

    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });

  it('has no ctx.steps policy without maximumAttempts', () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return policyBodies(source)
        .filter((body) => !/maximumAttempts\s*:/.test(body))
        .map(() => relative(ROOT, file));
    });

    expect(
      [...new Set(offenders)],
      'an unset maximumAttempts means "retry forever" on Temporal and a capped count on BullMQ, so the two runtimes would quietly behave differently',
    ).toEqual([]);
  });
});
