import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  readBuiltInCatalogue,
  seedBuiltInCatalogue,
} from '../../prisma/catalog/seed-catalogue';

/**
 * The catalogue table replaces the `McpConnectorProvider` enum as the answer to
 * *which connectors exist*, and for the length of the migration both are the
 * truth at once. Three copies of the same eleven names have to agree:
 *
 *   1. the enum in `prisma/schema.prisma`,
 *   2. `prisma/catalog/built-in-connectors.json`, projected from the manifests,
 *   3. the seed INSERT in the migration that creates the table — the only one
 *      of the three a deployment running `prisma migrate deploy` ever executes.
 *
 * The third is why this reads the migration as text. A built-in whose row the
 * migration never inserted resolves to nothing in production while every test
 * that seeds from the JSON passes.
 *
 * This guard goes when the enum does (Phase B5); the JSON-to-migration half
 * stays.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SCHEMA = join(REPO_ROOT, 'prisma/schema.prisma');
const MIGRATION = join(
  REPO_ROOT,
  'prisma/migrations/20260920100000_mcp_catalogue/migration.sql',
);

function enumMembers(source: string, name: string): string[] {
  const block = source.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!block) {
    throw new Error(`enum ${name} not found in schema.prisma`);
  }
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('/'));
}

describe('the seeded catalogue', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const entries = readBuiltInCatalogue();

  it('carries exactly the McpConnectorProvider members, in schema order', () => {
    expect(entries.map((e) => e.slug)).toEqual(
      enumMembers(schema, 'McpConnectorProvider'),
    );
  });

  it('uses an auth type the McpAuthType enum declares', () => {
    const authTypes = enumMembers(schema, 'McpAuthType');
    for (const entry of entries) {
      expect(authTypes).toContain(entry.authType);
    }
  });

  it('is inserted by the migration, not only by the seed script', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    for (const entry of entries) {
      expect(migration).toContain(`'${entry.slug}'`);
    }
  });

  it('names no server URL, because those are read from the environment', () => {
    // A built-in's `mcpServerUrl` and `authBaseUrl` stay null: seeding the
    // value a migration happens to see would mean a database promoted between
    // environments silently points Google at the wrong host.
    const asText = JSON.stringify(entries);
    expect(asText).not.toMatch(/https?:\/\/(localhost|mcp\.|api\.)/);
  });

  it('writes every entry through one upsert each, and updates no operator field', async () => {
    const calls: {
      where: { slug: string };
      update: Record<string, unknown>;
    }[] = [];
    const count = await seedBuiltInCatalogue({
      mcpCatalogEntry: {
        upsert: async (args) => {
          calls.push(args);
          return args;
        },
      },
    });

    expect(count).toBe(entries.length);
    expect(calls.map((c) => c.where.slug)).toEqual(entries.map((e) => e.slug));

    for (const call of calls) {
      // `enabled`, `allowsPrivateAddress` and `mcpServerUrl` belong to the
      // operator. A seed run that reset them would undo an administrator's
      // decision on every deploy.
      expect(Object.keys(call.update)).not.toContain('enabled');
      expect(Object.keys(call.update)).not.toContain('allowsPrivateAddress');
      expect(Object.keys(call.update)).not.toContain('mcpServerUrl');
      expect(Object.keys(call.update)).not.toContain('isBuiltIn');
    }
  });
});
