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
 * This suite already imported the script and passed while the script could not
 * be loaded by Node at all: it kept importing `gatewayModeFromEnv`, which B6
 * deleted along with the flag it read. `npm run gateway:preflight` died with
 * `SyntaxError: does not provide an export named 'gatewayModeFromEnv'` before
 * printing a line.
 *
 * The reason the suite missed it is worth stating, because it applies to every
 * test that imports a module without exercising it. The package resolves to a
 * CommonJS `dist`, and Node's ESM loader link-checks named imports against it
 * and throws; vite's interop does not — the missing name is simply `undefined`,
 * and no test called the function. A green import proves less than it looks.
 */
describe('the script imports only names the gateway package exports', () => {
  it('has no import that would fail to link under Node', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    const block = /import\s*\{([^}]*)\}\s*from\s*'@ragenai\/llm-gateway'/.exec(
      source,
    );

    expect(
      block,
      'the script no longer imports from the package',
    ).not.toBeNull();

    const imported = block![1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && !name.startsWith('type '))
      .map((name) => name.split(/\s+as\s+/)[0].trim());

    expect(imported.length).toBeGreaterThan(0);

    const missing = imported.filter(
      (name) => !(name in (gateway as Record<string, unknown>)),
    );

    expect(
      missing,
      'the script imports a name @ragenai/llm-gateway does not export — Node refuses to load it, and this suite would otherwise stay green',
    ).toEqual([]);
  });
});

/**
 * The preflight is what stands between a cutover and a 5xx on the first model
 * call, so the list it builds is worth asserting directly — importing it also
 * proves the script does not run a preflight on import, which it used to.
 */
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
