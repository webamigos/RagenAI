import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  authTypeRequiresBehaviourPack,
  isMcpAuthType,
} from '../../packages/platform-contracts/src/connectors/catalogue';
import { readBuiltInCatalogue } from '../../prisma/catalog/seed-catalogue';

/**
 * `PROVIDER_REGISTRY: Record<McpConnectorProvider, ProviderDefinition>` made
 * "every connector has a manifest" a **compile error**. The catalogue is rows
 * now, so that annotation is gone and nothing brings the guarantee back — an
 * entry an operator adds has no manifest at all, by design.
 *
 * This is what replaces it, and it is weaker on purpose: it says nothing about
 * connectors that do not exist yet, and everything about the eleven that ship
 * with Ragen. For each seeded entry: it names an auth shape this build knows,
 * it has a brand asset on disk in every app that renders one, and it has a
 * behaviour pack if — and only where — its auth shape needs code a row cannot
 * hold.
 *
 * It reads the two registries as text rather than importing them: both pull in
 * `shared-config.ts`, which reads server URLs from `process.env` at module
 * load, and the HubSpot and Slack manifests read OAuth client secrets the same
 * way. A test has no business loading either.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const REGISTRIES = [
  'apps/web/src/features/connectors/providers',
  'apps/api/src/connectors/providers',
];

/** Apps that render a connector's brand asset from `public/`. */
const ASSET_ROOTS = ['apps/web/public', 'apps/admin/public'];

/** The slugs the manifests in a registry directory declare. */
function packedSlugs(relativeDir: string): string[] {
  const dir = join(REPO_ROOT, relativeDir);
  const registry = readFileSync(join(dir, 'registry.ts'), 'utf8');
  const imported = [
    ...registry.matchAll(/from '\.\/([a-z-]+)(?:\.js)?';/g),
  ].map((match) => match[1]!);

  return imported
    .filter((name) => name !== 'shared-config' && name !== 'system-prompt')
    .flatMap((name) => {
      const source = readFileSync(join(dir, `${name}.ts`), 'utf8');
      const slug = source.match(/provider: '([A-Z_]+)'/)?.[1];
      return slug ? [slug] : [];
    });
}

describe('every seeded catalogue entry', () => {
  const entries = readBuiltInCatalogue();

  it('names an auth shape this build knows', () => {
    for (const entry of entries) {
      expect(isMcpAuthType(entry.authType), entry.slug).toBe(true);
    }
  });

  it('has a brand asset on disk in every app that renders one', () => {
    for (const entry of entries) {
      for (const root of ASSET_ROOTS) {
        const asset = join(REPO_ROOT, root, entry.icon);
        expect(existsSync(asset), `${entry.slug}: ${root}${entry.icon}`).toBe(
          true,
        );
      }
    }
  });

  it('has a behaviour pack in both apps where its auth shape needs one', () => {
    // `API_KEY_CUSTOM_HEADER` assembles its URL from the shop URL the user
    // types at connect time, which is code. Every other shape works from a row
    // alone, which is what lets Notion be a row.
    const needsCode = entries.filter((entry) =>
      authTypeRequiresBehaviourPack(entry.authType),
    );
    expect(needsCode.map((e) => e.slug)).toEqual([
      'WOOCOMMERCE',
      'OPEN_MERCATO',
    ]);

    for (const dir of REGISTRIES) {
      const packed = packedSlugs(dir);
      for (const entry of needsCode) {
        expect(packed, `${entry.slug} in ${dir}`).toContain(entry.slug);
      }
    }
  });

  it('is still packed in both apps, and the two agree', () => {
    // Not a requirement of the catalogue — a row with no pack is supported —
    // but the eleven built-ins are described twice today, and the copies are
    // kept in step by nothing but attention. Retiring the duplicate is its own
    // spec; until then this is the tripwire.
    const [web, api] = REGISTRIES.map(packedSlugs);
    expect([...web].sort()).toEqual([...api].sort());
    expect([...web].sort()).toEqual(entries.map((e) => e.slug).sort());
  });
});
