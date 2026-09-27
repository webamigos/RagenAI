import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * One number for how long Docling's sync endpoint may take, everywhere it is
 * set — the server's `DOCLING_SERVE_MAX_SYNC_WAIT` and the worker's default for
 * the same variable, from which the worker derives its own timeout.
 *
 * They disagreed before this: compose and the Railway image waited 300 s,
 * Helm set nothing and so waited upstream's 120 s, and the worker's Docling
 * step allowed ten minutes behind an implicit 300 s fetch limit. A Docling
 * that answers 504 at 120 s to a worker expecting 300 s reads as a flaky
 * server, not a configuration (spec 2026-09-26-docling-under-load, A2).
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');

function fromCompose(): string | undefined {
  const compose = parse(read('docker-compose.yml')) as {
    services: Record<string, { environment?: Record<string, string> }>;
  };
  return compose.services.docling?.environment?.DOCLING_SERVE_MAX_SYNC_WAIT;
}

function fromRailwayImage(): string | undefined {
  return read('infra/docling/Dockerfile').match(
    /^ENV DOCLING_SERVE_MAX_SYNC_WAIT=(\d+)$/m,
  )?.[1];
}

function fromHelm(): string | undefined {
  const values = parse(read('deploy/helm/ragen/values.yaml')) as {
    config?: Record<string, string>;
  };
  return values.config?.DOCLING_SERVE_MAX_SYNC_WAIT;
}

function workerDefault(): string | undefined {
  return read('apps/worker/src/consts.ts').match(
    /positiveIntFromEnv\(\s*'DOCLING_SERVE_MAX_SYNC_WAIT',\s*(\d+)/,
  )?.[1];
}

describe('DOCLING_SERVE_MAX_SYNC_WAIT', () => {
  it('is set, and set the same, wherever Docling is deployed', () => {
    const values = {
      compose: fromCompose(),
      railwayImage: fromRailwayImage(),
      helm: fromHelm(),
      workerDefault: workerDefault(),
    };

    // Each read must find something: a pattern that stopped matching would
    // otherwise compare `undefined` with `undefined` and pass.
    for (const [where, value] of Object.entries(values)) {
      expect(value, where).toMatch(/^\d+$/);
    }
    expect(new Set(Object.values(values)).size, JSON.stringify(values)).toBe(1);
  });

  it('reaches the Docling pod in Helm, not only the shared config', () => {
    expect(read('deploy/helm/ragen/templates/services.yaml')).toContain(
      'name: DOCLING_SERVE_MAX_SYNC_WAIT',
    );
  });
});
