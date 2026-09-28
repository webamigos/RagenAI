import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { DEFAULT_DOCLING_MAX_CONCURRENCY } from '../../packages/create-ragen-app/src/worker-runtime';

/**
 * One default for how many conversions Docling is sent at once, everywhere
 * the number is written down: the worker's fallback, what Helm sets, what
 * `.env.example` documents and what `create-ragen-app` writes into a fresh
 * install.
 *
 * The number rests on one fact about the server — docling-serve converts
 * `DOCLING_SERVE_ENG_LOC_NUM_WORKERS` (2) at a time — and on C3's measurement
 * when it lands (spec 2026-09-26-docling-under-load, D2). If that changes the
 * default, it has to change in all four; an install that wrote 4 while the
 * worker assumed 8 would be the fresh install measured against a number
 * nobody chose.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');

function workerDefault(): string | undefined {
  return read('apps/worker/src/consts.ts').match(
    /positiveIntFromEnv\(\s*'DOCLING_MAX_CONCURRENCY',\s*(\d+)/,
  )?.[1];
}

function fromHelm(): string | undefined {
  const values = parse(read('deploy/helm/ragen/values.yaml')) as {
    config?: Record<string, string>;
  };
  return values.config?.DOCLING_MAX_CONCURRENCY;
}

function fromEnvExample(): string | undefined {
  return read('.env.example').match(
    /^#?\s*DOCLING_MAX_CONCURRENCY=(\d+)$/m,
  )?.[1];
}

describe('DOCLING_MAX_CONCURRENCY', () => {
  it('has the same default in the worker, Helm, .env.example and the installer', () => {
    const values = {
      workerDefault: workerDefault(),
      helm: fromHelm(),
      envExample: fromEnvExample(),
      installer: DEFAULT_DOCLING_MAX_CONCURRENCY,
    };

    // A pattern that stopped matching would compare `undefined` with
    // `undefined` and pass, so each read has to find a number.
    for (const [where, value] of Object.entries(values)) {
      expect(value, where).toMatch(/^\d+$/);
    }
    expect(new Set(Object.values(values)).size, JSON.stringify(values)).toBe(1);
  });
});
