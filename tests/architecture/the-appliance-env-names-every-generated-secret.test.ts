import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { MANIFEST } from '../../packages/create-ragen-app/src/manifest';

/**
 * The appliance's environment template names every secret a fresh install
 * generates.
 *
 * `infra/appliance/appliance.env.example` is filled by hand on an appliance,
 * not by create-ragen-app. It listed three secrets while the installer
 * generates eight, and apps/api and the worker refuse to boot without the
 * rest — found by the first run of `npm run appliance:egress-check`, after
 * Phase 0 had shipped the template. The installer's manifest is the list a
 * real install gets, so this test reads it rather than a copy.
 *
 * Step A3 of docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
 */

const ROOT = process.cwd();

describe('the appliance env template', () => {
  it('names every root secret create-ragen-app generates', () => {
    const template = readFileSync(
      join(ROOT, 'infra/appliance/appliance.env.example'),
      'utf8',
    );
    const named = new Set(
      template
        .split('\n')
        .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
        .filter(Boolean),
    );
    const generated = MANIFEST.filter(
      (entry) =>
        entry.strategy === 'generate-secret' && entry.targets.includes('root'),
    ).map((entry) => entry.key);

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.filter((key) => !named.has(key))).toEqual([]);
  });
});
