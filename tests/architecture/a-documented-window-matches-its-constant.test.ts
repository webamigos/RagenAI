import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GUARDRAIL_CACHE_TTL_MS,
  GUARDRAIL_FAILURE_TTL_MS,
} from '../../packages/guardrails/src/contracts/cache';

/**
 * The guardrail cache window the documentation promises is the one the code
 * uses.
 *
 * This exists because the window is the whole of an operator's mental model
 * for two things they will do under pressure. The break-glass guidance says
 * disabling a rule in the panel "takes effect within the 60 s cache"; the spec
 * says a rule switched on applies within a minute. Neither is checkable by
 * reading the code, and nothing tied the sentence to the number.
 *
 * It is also the gap left open on purpose when `p0-29` was written. That spec
 * runs against a freshly started server, so it exercises a cold cache every
 * time and asserts nothing about the window. Two ways of covering it in e2e
 * were rejected — a spec that waits a minute becomes the first candidate for
 * deletion, and a cache-clearing seam asserts the seam rather than the window
 * — and this is what was proposed instead: hold the prose and the constant to
 * each other, and cover the expiry behaviour in a unit test with fake timers,
 * which `get-org-guardrails-query.test.ts` does.
 *
 * **The document is the source, not this file.** The seconds are read out of
 * the spec rather than written here, so a deliberate change to the window is
 * made in the place a human reads and this test follows. Hard-coding 60 here
 * would have made it a second copy of the thing it is trying to stop being
 * copied.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SPEC = join(
  'docs',
  'specs',
  '2026-09-18-guardrails-managed-from-the-admin-panel.md',
);

/**
 * Every document that states the window, not only the spec.
 *
 * `docs/guardrails.md` is the page an operator reads during an incident — it
 * is where "disable the rule; it stops applying within the 60 s cache" is
 * addressed to the person acting on it, while the spec addresses whoever is
 * building the thing. A number this test does not read is a number free to
 * drift, and the one that drifts unnoticed is the one nobody is writing code
 * against.
 */
const DOCUMENTS = [SPEC, join('docs', 'guardrails.md')];

const documented = DOCUMENTS.map((path) => ({
  path,
  text: readFileSync(join(REPO_ROOT, path), 'utf8'),
}));

/**
 * Every place the spec states the window in seconds.
 *
 * Matched on "<n> s cache" and "<n> s per-org cache" — the two spellings the
 * document actually uses. A new spelling is not silently ignored: the count
 * assertion below fails if the matches disappear, which is what would happen
 * if somebody reworded every occurrence at once.
 */
const statedSeconds = documented.flatMap(({ text }) =>
  [...text.matchAll(/(\d+)\s*s\s+(?:per-org\s+)?cache/g)].map((match) =>
    Number(match[1]),
  ),
);

describe('a documented window matches its constant', () => {
  it('finds the statements it claims to check', () => {
    // Without this the assertion below passes over an empty list, which is the
    // failure mode `docs/lessons.md` records three separate instances of.
    expect(
      statedSeconds.length,
      `${DOCUMENTS.join(' / ')} no longer state the cache window as ` +
        '"<n> s cache". ' +
        'Either the wording changed — update the pattern in this test — or ' +
        'the promise was removed, in which case say so deliberately.',
    ).toBeGreaterThanOrEqual(2);
  });

  it('states one window, not several', () => {
    // Two different numbers in the same document is worse than either being
    // wrong: whichever an operator reads first is the one they act on.
    expect(
      [...new Set(statedSeconds)],
      'the documents state more than one cache window between them',
    ).toHaveLength(1);
  });

  it('agrees with GUARDRAIL_CACHE_TTL_MS', () => {
    const [seconds] = statedSeconds;

    expect(
      GUARDRAIL_CACHE_TTL_MS,
      `${DOCUMENTS.join(' / ')} promise a ${seconds} s cache and the code ` +
        `uses ` +
        `${GUARDRAIL_CACHE_TTL_MS}ms. An operator disabling a rule during an ` +
        'incident is told how long to wait by that sentence. Change both, in ' +
        'one commit, or change neither.',
    ).toBe(seconds * 1000);
  });

  it('keeps the failure window shorter than the success window', () => {
    // The negative cache is the interval in which guardrails are *not*
    // enforced. Equal or longer would mean an outage suppresses protection for
    // at least as long as a successful load serves it, which inverts the
    // trade-off it was added for.
    expect(GUARDRAIL_FAILURE_TTL_MS).toBeLessThan(GUARDRAIL_CACHE_TTL_MS);
    expect(GUARDRAIL_FAILURE_TTL_MS).toBeGreaterThan(0);
  });

  it('is the only place either window is declared', () => {
    // Both were declared twice — exported from apps/web and again as a private
    // const in apps/api's loader. Drift would make the documented sentence
    // true on one surface and false on the other.
    const { readdirSync, statSync } =
      require('node:fs') as typeof import('node:fs');

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (
          ['node_modules', 'dist', '.next', '.turbo', 'generated'].includes(
            entry,
          )
        ) {
          continue;
        }
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.ts$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry)) {
          const code = readFileSync(full, 'utf8').replace(
            /\/\*[\s\S]*?\*\//g,
            '',
          );
          // A literal 60_000 or 5_000 assigned to something cache-shaped.
          if (/(?:CACHE|TTL)_?[A-Z_]*\s*=\s*(?:60_000|5_000)\b/.test(code)) {
            offenders.push(full.slice(REPO_ROOT.length + 1));
          }
        }
      }
    };
    for (const root of ['apps/web/src', 'apps/api/src', 'apps/admin/src']) {
      walk(join(REPO_ROOT, root));
    }

    expect(
      offenders,
      'these files declare a guardrail cache window of their own; import ' +
        'GUARDRAIL_CACHE_TTL_MS from @ragenai/guardrails instead',
    ).toEqual([]);
  });
});
