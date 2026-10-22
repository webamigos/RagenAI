import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  APPLIANCE_TIERS,
  findOffMachineRoutes,
  findUnroutedModels,
} from '../../packages/create-ragen-app/src/appliance';
import {
  MANIFEST,
  type EnvTarget,
} from '../../packages/create-ragen-app/src/manifest';
import {
  LLM_PROVIDERS,
  resolveLlmProviderChoice,
  type LlmProviderChoice,
} from '../../packages/create-ragen-app/src/llm-provider';
import {
  doclingCeilingEnvUpdates,
  WORKER_RUNTIME_LABELS,
  resolveWorkerRuntimeSelection,
  type WorkerRuntimeChoice,
} from '../../packages/create-ragen-app/src/worker-runtime';
import { readSource } from './tracked-files';

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
  for (const line of readSource(path).split('\n')) {
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

  // The worker-runtime step is the same shape: its keys bypass MANIFEST and a
  // missing line stops the install. `DOCLING_MAX_CONCURRENCY` is the one most
  // likely to go, since the template carries it commented out.
  const workerRuntimeKeys = (
    Object.keys(WORKER_RUNTIME_LABELS) as WorkerRuntimeChoice[]
  ).flatMap((choice) =>
    Object.keys({
      ...resolveWorkerRuntimeSelection(choice, { temporalServerAddress: '' })
        .envUpdates,
      ...doclingCeilingEnvUpdates(choice),
    }).map((key) => [choice, key] as const),
  );

  it.each(workerRuntimeKeys)(
    'the %s runtime writes %s, which the root .env.example still has',
    (_choice, key) => {
      expect(
        keysByTarget.root.has(key),
        `packages/create-ragen-app/src/worker-runtime.ts writes ${key} into the root .env.local, but the root .env.example has no such line. applyEnvOverrides treats that as a missing key and stops the install.`,
      ).toBe(true);
    },
  );

  // The appliance step is the same shape again, plus a copy of three files the
  // package cannot read at test time from npm: the route table, the compose
  // overlay and the env template. Its tiers are data written against them.
  const applianceKeys = APPLIANCE_TIERS.flatMap((tier) =>
    Object.keys(tier.envUpdates).map((key) => [tier.id, key] as const),
  );

  it.each(applianceKeys)(
    'the %s appliance tier writes %s, which the root .env.example still has',
    (_tier, key) => {
      expect(
        keysByTarget.root.has(key),
        `packages/create-ragen-app/src/appliance.ts writes ${key} into the root .env.local, but the root .env.example has no such line. applyEnvOverrides treats that as a missing key and stops the install.`,
      ).toBe(true);
    },
  );
});

/**
 * An appliance install is what `infra/appliance/` describes, not a second
 * opinion of it. Step C1 of
 * docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
 */
describe.each(APPLIANCE_TIERS.map((tier) => [tier.id, tier] as const))(
  'the %s appliance tier',
  (_id, tier) => {
    const routeTable = readSource(join(REPO_ROOT, tier.routeFile));

    it('names files that exist', () => {
      for (const file of [
        tier.routeFile,
        ...tier.composeFiles,
        tier.gpuComposeFile,
      ]) {
        expect(existsSync(join(REPO_ROOT, file)), file).toBe(true);
      }
    });

    it('installs a route table with nothing that leaves the machine', () => {
      expect(findOffMachineRoutes(routeTable, tier.localConnections)).toEqual(
        [],
      );
    });

    it('selects only models its route table routes', () => {
      expect(findUnroutedModels(routeTable, tier.envUpdates)).toEqual([]);
    });

    it("is the table the appliance's containers read", () => {
      // The wizard copies the table over routes.yaml for the host; the
      // containers read the original through LLM_ROUTES_PATH. If the overlay
      // pointed elsewhere, the two would serve different routes.
      const overlay = readSource(
        join(REPO_ROOT, tier.composeFiles.at(-1) as string),
      );
      expect(overlay).toContain(`LLM_ROUTES_PATH: /app/${tier.routeFile}`);
    });

    it('agrees with the appliance env template on every key both set', () => {
      const template = new Map(
        readSource(join(REPO_ROOT, 'infra/appliance/appliance.env.example'))
          .split('\n')
          .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim()))
          .filter((match): match is RegExpExecArray => match !== null)
          .map((match) => [match[1] as string, match[2] as string]),
      );
      const shared = Object.entries(tier.envUpdates).filter(([key]) =>
        template.has(key),
      );

      // Most of the tier is in the template; a read that found nothing would
      // pass the comparison below vacuously.
      expect(shared.length).toBeGreaterThan(5);
      for (const [key, value] of shared) {
        expect(value, key).toBe(template.get(key));
      }
    });
  },
);
