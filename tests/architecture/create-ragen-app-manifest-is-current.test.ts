import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MANIFEST,
  type EnvTarget,
} from '../../packages/create-ragen-app/src/manifest';
import {
  LLM_PROVIDERS,
  resolveLlmProviderChoice,
  type LlmProviderChoice,
} from '../../packages/create-ragen-app/src/llm-provider';

/**
 * `packages/create-ragen-app` writes generated secrets and corrected local
 * defaults into the two `.env.example` templates it ships as `.env.local`
 * (root and apps/admin), by replacing the line named by each manifest entry's
 * key. If one of those `.env.example` files renames or removes a var the
 * manifest still references, the wizard silently stops setting it — the key
 * just never matches a line, and `applyEnvOverrides`'s `missingKeys` warning
 * only fires when someone actually runs the CLI, not in CI.
 *
 * This does not catch the opposite drift (a newly added secret nobody taught
 * the manifest about) — that one has no reliable textual signal to check.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const ENV_EXAMPLE_PATHS: Record<EnvTarget, string> = {
  root: join(REPO_ROOT, '.env.example'),
  admin: join(REPO_ROOT, 'apps/admin/.env.example'),
};

const ENV_LINE = /^#?\s*([A-Z][A-Z0-9_]*)=/;

function keysInEnvExample(path: string): Set<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const key = ENV_LINE.exec(line)?.[1];
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

describe('create-ragen-app manifest stays current', () => {
  const keysByTarget: Record<EnvTarget, Set<string>> = {
    root: keysInEnvExample(ENV_EXAMPLE_PATHS.root),
    admin: keysInEnvExample(ENV_EXAMPLE_PATHS.admin),
  };

  it('finds env vars to check, so a broken read cannot pass vacuously', () => {
    expect(keysByTarget.root.size).toBeGreaterThan(5);
    expect(keysByTarget.admin.size).toBeGreaterThan(5);
  });

  const manifestTargets = MANIFEST.flatMap((entry) =>
    entry.targets.map((target) => [entry.key, target] as const),
  );

  it.each(manifestTargets)(
    '%s has a matching line in the %s .env.example',
    (key, target) => {
      expect(
        keysByTarget[target].has(key),
        `packages/create-ragen-app/src/manifest.ts writes ${key} into the ${target} .env.local, but ${target}'s .env.example has no such line — it was likely renamed or removed. Update the manifest alongside it.`,
      ).toBe(true);
    },
  );

  // The provider step writes its own keys (the API key, DEFAULT_MODEL,
  // REPHRASE_MODEL, EMBEDDINGS_MODEL, VECTOR_SIZE) without going through
  // MANIFEST, and `applyEnvOverrides` reports a key it cannot match as a
  // hard stop — so drift here aborts the install at the env-writing step
  // rather than merely skipping a variable.
  const providerKeys = (
    Object.keys(LLM_PROVIDERS) as LlmProviderChoice[]
  ).flatMap((choice) =>
    Object.keys(resolveLlmProviderChoice(choice, 'token').envUpdates).map(
      (key) => [choice, key] as const,
    ),
  );

  it.each(providerKeys)(
    'the %s provider writes %s, which the root .env.example still has',
    (_choice, key) => {
      expect(
        keysByTarget.root.has(key),
        `packages/create-ragen-app/src/llm-provider.ts writes ${key} into the root .env.local, but the root .env.example has no such line. applyEnvOverrides treats that as a missing key and stops the install.`,
      ).toBe(true);
    },
  );
});
