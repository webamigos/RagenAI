import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `ConnectorDto` is declared twice — once in apps/web, once in apps/api — as
 * hand-copied `Pick<McpConnector, …>` siblings. apps/api serves the payload;
 * apps/web types the response it receives from it.
 *
 * Nothing connects them. Each `Pick` resolves against its own workspace's
 * generated Prisma client, so **both compile whatever the other says**, and
 * two failure modes typecheck cleanly:
 *
 * - a field added to apps/web's `Pick` only → the UI reads a property the API
 *   never sends, and gets `undefined` at runtime;
 * - a field added to both `Pick`s but not to the `select` in
 *   `getUserConnectors` → same result, from the other direction. Prisma
 *   returns the narrower row, TypeScript believes the annotation.
 *
 * The second one is the reason this test checks the query and not just the
 * types. Adding `lastError` to both DTOs and forgetting the `select` would
 * have shipped a connector-failure banner that rendered "—" forever.
 *
 * ADR-33's answer to duplication like this is one shared declaration in
 * `@ragenai/platform-contracts`. That is the right destination for these two;
 * until they move, this is the tripwire.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const WEB_TYPES = join(
  REPO_ROOT,
  'apps/web/src/features/connectors/contracts/connector.types.ts',
);
const API_TYPES = join(REPO_ROOT, 'apps/api/src/connectors/types.ts');
const API_SERVICE = join(
  REPO_ROOT,
  'apps/api/src/connectors/connectors.service.ts',
);

/**
 * Every field `ConnectorDto` promises, from both halves of it.
 *
 * The declaration is no longer a bare `Pick`: `provider` left the Pick when it
 * stopped being the enum, and `providerSlug` joined it in an intersection —
 * see docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md. Reading only
 * the Pick would have quietly stopped checking the two fields the migration is
 * about, which is the failure this whole test exists to catch.
 */
function pickedFields(source: string): string[] {
  const declaration = source.match(
    /export type ConnectorDto = Pick<\s*McpConnector,([\s\S]*?)>\s*(&\s*\{([\s\S]*?)\n\};|;)/,
  );
  if (!declaration) {
    return [];
  }

  const picked = [...declaration[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map(
    (match) => match[1]!,
  );
  const intersected = declaration[3]
    ? [...declaration[3].matchAll(/^\s{2}([A-Za-z0-9_]+)\??:/gm)].map(
        (match) => match[1]!,
      )
    : [];

  return [...picked, ...intersected];
}

/** The keys of the `select` in `getUserConnectors`. */
function selectedFields(source: string): string[] {
  const method = source.match(
    /async getUserConnectors\([\s\S]*?select:\s*\{([\s\S]*?)\},/,
  )?.[1];
  if (!method) {
    return [];
  }
  return [...method.matchAll(/([A-Za-z0-9_]+):\s*true/g)].map(
    (match) => match[1]!,
  );
}

describe('ConnectorDto', () => {
  const web = pickedFields(readFileSync(WEB_TYPES, 'utf8'));
  const api = pickedFields(readFileSync(API_TYPES, 'utf8'));
  const selected = selectedFields(readFileSync(API_SERVICE, 'utf8'));

  it('still names the column the expand/contract landed on', () => {
    // `providerSlug` is declared outside the Pick, because it is a `string`
    // here rather than the enum the column used to be. A reader that lost
    // track of it would leave the API free to stop sending the one field that
    // says which connector a row is.
    expect(web).toContain('providerSlug');
    expect(api).toContain('providerSlug');
    // And the enum column is off the wire entirely since B3.
    expect(web).not.toContain('provider');
    expect(api).not.toContain('provider');
  });

  it('is declared in both workspaces', () => {
    expect(web.length, 'apps/web ConnectorDto not found').toBeGreaterThan(0);
    expect(api.length, 'apps/api ConnectorDto not found').toBeGreaterThan(0);
  });

  it('picks the same fields in both workspaces', () => {
    expect([...web].sort()).toEqual([...api].sort());
  });

  it('is fully populated by getUserConnectors', () => {
    expect(selected.length, 'select not found').toBeGreaterThan(0);

    // Every promised field must actually be read. The reverse is allowed:
    // selecting more than the DTO exposes is wasteful, not wrong.
    const promisedButNotSelected = api.filter(
      (field) => !selected.includes(field),
    );
    expect(promisedButNotSelected).toEqual([]);
  });
});
