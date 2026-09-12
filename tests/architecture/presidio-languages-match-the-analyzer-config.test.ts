import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The worker's list of analyzer languages must match what the deployed
 * Presidio analyzer is configured to serve.
 *
 * `mask-pii.ts` cannot simply pass a detected language through. Presidio
 * answers a language it has no model for with **HTTP 500** (`No matching
 * recognizers were found to serve the request.`), which Temporal retries and
 * then fails the ingest on. So the worker checks the detected language against
 * a list and falls back when it is not on it — and that list is a hand-written
 * copy of `infra/presidio/analyzer/conf/analyzer.yaml`.
 *
 * The two ways it can drift both fail quietly:
 *
 * - a language **added** to the YAML and not to the worker means every
 *   document in it silently falls back to English, which is a weaker version
 *   of the bug this was written to fix (analysing everything as Polish
 *   replaced ordinary English words with `<PERSON>` at ingest, in the vector
 *   store, recoverable only by re-indexing);
 * - a language **removed** from the YAML and left in the worker means ingest
 *   starts failing on documents that used to work, with a 500 from a sidecar
 *   rather than anything naming the cause.
 *
 * Same shape as `hand-copied-lists-drift-and-typecheck-only-sees-one.md`: two
 * copies, no type connecting them, and the disagreement only visible at
 * runtime.
 */

const ROOT = join(__dirname, '..', '..');

function analyzerYamlLanguages(): string[] {
  const yaml = readFileSync(
    join(ROOT, 'infra', 'presidio', 'analyzer', 'conf', 'analyzer.yaml'),
    'utf8',
  );
  // Deliberately not a YAML parser: this reads one flat list of scalars, and
  // the rest of tests/architecture/ reads source as text for the same reason.
  const block = yaml.match(/supported_languages:\s*\n((?:\s*-\s*\S+\n?)+)/);
  expect(
    block,
    'analyzer.yaml no longer declares a supported_languages list — this guard needs updating with it',
  ).not.toBeNull();
  return [...block![1].matchAll(/-\s*(\S+)/g)].map((m) => m[1]);
}

function workerLanguages(): string[] {
  const source = readFileSync(
    join(
      ROOT,
      'apps',
      'worker',
      'src',
      'activities',
      'documents',
      'mask-pii.ts',
    ),
    'utf8',
  );
  const decl = source.match(/PRESIDIO_SUPPORTED_LANGUAGES\s*=\s*\[([^\]]*)\]/);
  expect(
    decl,
    'mask-pii.ts no longer exports PRESIDIO_SUPPORTED_LANGUAGES as an array literal',
  ).not.toBeNull();
  return [...decl![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('Presidio languages', () => {
  it('the worker list and the analyzer config declare the same languages', () => {
    expect([...workerLanguages()].sort()).toEqual(
      [...analyzerYamlLanguages()].sort(),
    );
  });

  // Analysing every document with the Polish model is the defect this whole
  // mechanism exists to prevent; a fallback of 'pl' would reinstate it for
  // every document whose language is undetected or unsupported.
  it('the fallback language is one the analyzer serves, and is not Polish', () => {
    const source = readFileSync(
      join(
        ROOT,
        'apps',
        'worker',
        'src',
        'activities',
        'documents',
        'mask-pii.ts',
      ),
      'utf8',
    );
    const fallback = source.match(/PRESIDIO_FALLBACK_LANGUAGE\s*=\s*'([^']+)'/);
    expect(fallback).not.toBeNull();
    expect(analyzerYamlLanguages()).toContain(fallback![1]);
    expect(fallback![1]).not.toBe('pl');
  });
});
