import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as gateway from '@ragenai/llm-gateway';

import { configuredModels } from '../../scripts/gateway-preflight.mts';

const SCRIPT = join(
  import.meta.dirname,
  '..',
  '..',
  'scripts',
  'gateway-preflight.mts',
);

/**
 * Every value the script imports from the gateway package still exists.
 *
 * This suite already imported the script and passed while `npm run
 * gateway:preflight` died before printing a line: it kept importing
 * `gatewayModeFromEnv`, which B6 deleted along with the flag it read.
 *
 * **Why this is a text check and not a subprocess.** The obvious stronger
 * guard — spawn Node on the script and let its ESM loader link-check the
 * import for real — was tried and does not work here. Under `--import tsx`,
 * the failure is Node-version dependent: the user hit
 * `SyntaxError: does not provide an export named 'gatewayModeFromEnv'` on Node
 * 22, and the identical file with the identical dead import *loads and runs*
 * on Node 24, which is the version this repository requires. A subprocess
 * guard would therefore be green on our own Node, for the wrong reason, which
 * is worse than no guard.
 *
 * So the names are read out of the script as text and checked against the
 * package two ways that cannot both be fooled by a loader: the module
 * namespace as this runner resolves it (the built `dist`, which is what Node
 * loads), and the source barrel's own export list (what the package means to
 * export). Vite's CJS interop turns a missing name into `undefined` rather
 * than an error, which is precisely why asserting on the namespace alone was
 * the reviewable half.
 */
const GATEWAY_BARREL = join(
  import.meta.dirname,
  '..',
  '..',
  'packages',
  'llm-gateway',
  'src',
  'index.ts',
);

/** Value exports declared by the package's barrel, `type` ones excluded. */
function barrelExports(): Set<string> {
  const source = readFileSync(GATEWAY_BARREL, 'utf8');
  const names = new Set<string>();
  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of block[1].split(',')) {
      const name = raw.trim();
      if (name.length === 0 || name.startsWith('type ')) {
        continue;
      }
      names.add(
        name
          .split(/\s+as\s+/)
          .pop()!
          .trim(),
      );
    }
  }
  return names;
}

function importedFromGateway(): string[] {
  const source = readFileSync(SCRIPT, 'utf8');
  const block = /import\s*\{([^}]*)\}\s*from\s*'@ragenai\/llm-gateway'/.exec(
    source,
  );

  expect(block, 'the script no longer imports from the package').not.toBeNull();

  return block![1]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !name.startsWith('type '))
    .map((name) => name.split(/\s+as\s+/)[0].trim());
}

describe('the script imports only names the gateway package exports', () => {
  it('imports nothing the built package does not expose', () => {
    const imported = importedFromGateway();
    expect(imported.length).toBeGreaterThan(0);

    const missing = imported.filter(
      (name) => !(name in (gateway as Record<string, unknown>)),
    );

    expect(
      missing,
      'the script imports a name @ragenai/llm-gateway does not export — Node refuses to load it, and this suite would otherwise stay green',
    ).toEqual([]);
  });

  it('imports nothing the source barrel does not declare', () => {
    const declared = barrelExports();
    expect(declared.size).toBeGreaterThan(0);

    const missing = importedFromGateway().filter((name) => !declared.has(name));

    expect(
      missing,
      'the script imports a name packages/llm-gateway/src/index.ts does not export — a stale dist can hide this from the namespace check above',
    ).toEqual([]);
  });
});

describe('the models a deployment is configured to use', () => {
  it('defaults the models an env need not name', () => {
    const models = configuredModels({});

    expect(models.map((m) => `${m.variable}=${m.id}`)).toEqual([
      'REPHRASE_MODEL=mistral-small-3.2',
      'SUMMARY_MODEL=gemini-2.5-flash',
      'EMBEDDINGS_MODEL=bge-multilingual-gemma2',
      'PDF_MODEL=claude-haiku-4-5',
      'apps/worker pdf-process-rag mini tier=gpt-5.4-mini',
      'apps/worker SRT segmentation=gpt-5.4-nano',
    ]);
  });

  /**
   * The gap this script had. A model named by a constant in worker source has
   * no variable to read, so a check that enumerates the environment cannot see
   * it — and all three of these were unroutable while the preflight reported a
   * clean deployment. Asserting them by id, because there is no variable name
   * to key on and that is exactly the point.
   */
  it('includes the models named in source rather than by a variable', () => {
    const ids = configuredModels({}).map((m) => m.id);

    expect(ids).toContain('gpt-5.4-mini');
    expect(ids).toContain('gpt-5.4-nano');
  });

  it('omits a variable that is set to nothing rather than defaulting it', () => {
    const models = configuredModels({ DEFAULT_MODEL: '' });

    expect(models.some((m) => m.variable === 'DEFAULT_MODEL')).toBe(false);
  });

  it('trims whitespace, which a copied env value usually carries', () => {
    const [first] = configuredModels({ DEFAULT_MODEL: '  gpt-oss-120b \n' });

    expect(first).toMatchObject({
      variable: 'DEFAULT_MODEL',
      id: 'gpt-oss-120b',
    });
  });

  it('marks the embedding model as one', () => {
    const models = configuredModels({});
    const embedding = models.filter((m) => m.kind === 'embedding');

    expect(embedding).toHaveLength(1);
    expect(embedding[0].variable).toBe('EMBEDDINGS_MODEL');
  });

  /**
   * A fallback-only miss is reported but does not block a flip — it is equally
   * unserved on the proxy path — so the flag has to survive de-duplication.
   */
  it('marks every fallback-only model', () => {
    const models = configuredModels({ MULTIMODAL_FALLBACK_MODEL: 'gpt-5.4' });

    expect(
      models
        .filter((m) => m.fallbackOnly)
        .map((m) => m.id)
        .sort(),
    ).toEqual(['claude-haiku-4-5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']);
  });

  it('de-duplicates by id, keeping the variable that named it first', () => {
    const models = configuredModels({
      DEFAULT_MODEL: 'mistral-small-3.2',
      REPHRASE_MODEL: 'mistral-small-3.2',
    });

    const mistral = models.filter((m) => m.id === 'mistral-small-3.2');
    expect(mistral).toHaveLength(1);
    expect(mistral[0].variable).toBe('DEFAULT_MODEL');
  });

  /**
   * Same id, different kind, is not a duplicate: an endpoint can serve a name
   * for chat and refuse it for embeddings, and the probe has to try both.
   */
  it('keeps one id that is used as both a chat and an embedding model', () => {
    const models = configuredModels({
      DEFAULT_MODEL: 'shared-name',
      EMBEDDINGS_MODEL: 'shared-name',
    });

    expect(models.filter((m) => m.id === 'shared-name')).toHaveLength(2);
  });
});
