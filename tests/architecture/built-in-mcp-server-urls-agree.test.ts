import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILT_IN_MCP_SERVERS } from '../../packages/env/src/mcp-servers';

/**
 * `MCP_GOOGLE_SERVER_URL` and its four siblings are read in three places now:
 * `shared-config.ts` in `apps/web`, the file in `apps/api` whose header says
 * "ported verbatim", and `@ragenai/env`'s seam, which `apps/admin` uses to
 * render a catalogue entry's resolved server URL.
 *
 * Nothing connects them. Each is a `process.env.X || 'default'` expression in
 * its own workspace, so a changed default in one is invisible to the others —
 * and the symptom is a connector that dials the wrong host in one app and the
 * right one in the next, which nobody reads as a configuration bug.
 *
 * This holds the two app copies to the seam until they are migrated onto it,
 * and then it holds the migration honest.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const COPIES = [
  'apps/web/src/features/connectors/providers/shared-config.ts',
  'apps/api/src/connectors/providers/shared-config.ts',
];

/** `MCP_FOO_SERVER_URL` → its fallback literal, as the file writes it. */
function declaredDefaults(source: string): Record<string, string> {
  const found: Record<string, string> = {};
  const pattern = /process\.env\.(MCP_[A-Z_]+_SERVER_URL)\s*\|\|\s*'([^']+)'/g;
  let match = pattern.exec(source);
  while (match) {
    found[match[1]] = match[2];
    match = pattern.exec(source);
  }
  return found;
}

describe('a built-in connector’s server address', () => {
  const fromSeam = Object.fromEntries(
    Object.values(BUILT_IN_MCP_SERVERS).map((s) => [s.variable, s.fallback]),
  );

  it.each(COPIES)('is the same in %s as in @ragenai/env', (relative) => {
    const source = readFileSync(join(REPO_ROOT, relative), 'utf8');
    expect(declaredDefaults(source)).toEqual(fromSeam);
  });

  it('derives Google’s auth host from the server host in both apps', () => {
    for (const relative of COPIES) {
      const source = readFileSync(join(REPO_ROOT, relative), 'utf8');
      expect(source).toMatch(
        /MCP_GOOGLE_AUTH_URL\s*\|\|\s*MCP_GOOGLE_SERVER_URL/,
      );
    }
  });
});
