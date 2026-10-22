import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { MANIFEST } from '../../packages/create-ragen-app/src/manifest';

/**
 * `infra/appliance/install-spark.sh` generates every secret a fresh install
 * needs, leaves encryption opt-in, and runs the compose files that exist.
 *
 * The script fills `.env.local` from the appliance template and generates the
 * secrets itself, from a list written in bash. A secret added to
 * create-ragen-app's manifest and not to that list leaves it empty, and
 * apps/api and the worker refuse to boot — on the client's machine, after a
 * 20 GB model pull. The manifest is the list a real install gets, so this test
 * reads it rather than a copy.
 *
 * apps/admin reads only its own `apps/admin/.env.local`. The first version of
 * the script never wrote it, so the admin container started without the
 * secret it calls web with, and invitation resend and guardrail trials failed
 * (found in review on #1665).
 */

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, 'infra/appliance/install-spark.sh'),
  'utf8',
);

function bashArray(name: string): string[] {
  const block =
    new RegExp(`^${name}=\\(\\n([\\s\\S]*?)^\\)`, 'm').exec(SCRIPT)?.[1] ?? '';
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function generatedFor(target: 'root' | 'admin') {
  return MANIFEST.filter(
    (entry) =>
      entry.strategy === 'generate-secret' && entry.targets.includes(target),
  );
}

describe('install-spark.sh', () => {
  it('generates every root secret create-ragen-app generates', () => {
    const generated = generatedFor('root').map((entry) => entry.key);
    const named = new Set(bashArray('SECRETS'));

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.filter((key) => !named.has(key))).toEqual([]);
  });

  it('writes every admin secret, copying the ones shared with root', () => {
    const admin = generatedFor('admin');
    const shared = admin
      .filter((entry) => entry.targets.includes('root'))
      .map((entry) => entry.key);
    const own = admin
      .filter((entry) => !entry.targets.includes('root'))
      .map((entry) => entry.key);

    expect(admin.length).toBeGreaterThan(0);
    expect(bashArray('ADMIN_SECRETS').sort()).toEqual(own.sort());
    expect(bashArray('ADMIN_SHARED_SECRETS').sort()).toEqual(shared.sort());
  });

  it('leaves the encryption key to --encrypt, never to the default run', () => {
    // A test install should not leave a key behind that must be kept for
    // ever; the key is generated only when asked for.
    expect(bashArray('SECRETS')).not.toContain('ENCRYPTION_MASTER_KEY');
    expect(SCRIPT).toMatch(/--encrypt\) ENCRYPT=1/);
  });

  it('names only compose files that exist', () => {
    const files = SCRIPT.match(/docker-compose[\w.]*\.yml/g) ?? [];

    expect(files.length).toBeGreaterThan(0);
    for (const file of new Set(files)) {
      expect(() => readFileSync(join(ROOT, file))).not.toThrow();
    }
  });
});
