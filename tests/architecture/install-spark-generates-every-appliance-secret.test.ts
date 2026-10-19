import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { MANIFEST } from '../../packages/create-ragen-app/src/manifest';

/**
 * `infra/appliance/install-spark.sh` generates every secret a fresh install
 * needs, and runs the compose files that exist.
 *
 * The script fills `.env.local` from the appliance template and generates the
 * secrets itself, from a list written in bash. A secret added to
 * create-ragen-app's manifest and not to that list leaves it empty, and
 * apps/api and the worker refuse to boot — on the client's machine, after a
 * 20 GB model pull. The manifest is the list a real install gets, so this test
 * reads it rather than a copy.
 */

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, 'infra/appliance/install-spark.sh'),
  'utf8',
);

function scriptSecrets(): string[] {
  const block = /^SECRETS=\(\n([\s\S]*?)^\)/m.exec(SCRIPT)?.[1] ?? '';
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('install-spark.sh', () => {
  it('generates every root secret create-ragen-app generates', () => {
    const generated = MANIFEST.filter(
      (entry) =>
        entry.strategy === 'generate-secret' && entry.targets.includes('root'),
    ).map((entry) => entry.key);
    const named = new Set(scriptSecrets());

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.filter((key) => !named.has(key))).toEqual([]);
  });

  it('generates the local encryption key the appliance template selects', () => {
    expect(scriptSecrets()).toContain('ENCRYPTION_MASTER_KEY');
  });

  it('names only compose files that exist', () => {
    const files = SCRIPT.match(/docker-compose[\w.]*\.yml/g) ?? [];
    const local = 'docker-compose.spark.local.yml';

    expect(files.length).toBeGreaterThan(0);
    for (const file of new Set(files)) {
      if (file === local) {
        continue;
      }
      expect(() => readFileSync(join(ROOT, file))).not.toThrow();
    }
  });

  it('keeps the overlay it writes out of git', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');

    expect(gitignore).toMatch(/^docker-compose\.spark\.local\.yml$/m);
  });
});
