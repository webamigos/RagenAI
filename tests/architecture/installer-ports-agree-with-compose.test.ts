import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * `create-ragen-app` warns when something already holds a port the stack is
 * about to publish. It cannot read `docker-compose.yml` to find out which
 * ports those are — the warning happens *before* the repository is cloned, so
 * there is no file yet — so it carries its own copy of the table.
 *
 * A copy is exactly what went wrong the last time: the wizard checked for the
 * volume name `ragen-postgres-data`, that name stopped being pinned, and the
 * check went on returning "clear" for every install. Nothing failed; the
 * warning simply never fired again.
 *
 * So this holds the copy to the original. Add a published port to compose and
 * the wizard will not warn about it until it is listed here too.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * `"${RAGEN_BIND_ADDR:-127.0.0.1}:${POSTGRES_PORT:-55432}:5432"` → POSTGRES_PORT, 55432.
 *
 * Only the host side is read. The container-side port is the service's own and
 * has nothing to do with what a second stack collides on.
 *
 * Profiles matter: `observability` publishes three more ports, and a plain
 * `docker compose up` starts none of them — so warning about them would be a
 * warning about a stack nobody asked for. `pii` and `s3` are included because
 * the wizard starts them — and checks their ports — when, and only when,
 * masking or RustFS storage was chosen (`PROFILE_PUBLISHED_PORTS` in
 * `tasks.ts`).
 */
const PROFILES_THE_WIZARD_MAY_START = new Set(['pii', 's3']);

function publishedPortsFromCompose(): Map<string, number> {
  const compose = parse(
    readFileSync(join(REPO_ROOT, 'docker-compose.yml'), 'utf8'),
  ) as {
    services: Record<string, { profiles?: string[]; ports?: string[] }>;
  };
  const found = new Map<string, number>();

  for (const service of Object.values(compose.services)) {
    const profiles = service.profiles ?? [];
    if (
      profiles.some((profile) => !PROFILES_THE_WIZARD_MAY_START.has(profile))
    ) {
      continue;
    }

    for (const mapping of service.ports ?? []) {
      const match = /\$\{([A-Z0-9_]+):-(\d+)\}:\d+$/.exec(mapping);
      if (match) {
        found.set(match[1], Number(match[2]));
      }
    }
  }

  return found;
}

/** The wizard's table, read as text — importing it would build the package. */
function portsFromInstaller(): Map<string, number> {
  const source = readFileSync(
    join(REPO_ROOT, 'packages', 'create-ragen-app', 'src', 'tasks.ts'),
    'utf8',
  );
  const found = new Map<string, number>();

  for (const [, variable, port] of source.matchAll(
    /variable:\s*'([A-Z0-9_]+)',\s*port:\s*(\d+)/g,
  )) {
    found.set(variable, Number(port));
  }

  return found;
}

describe('the installer’s port table agrees with docker-compose.yml', () => {
  const compose = publishedPortsFromCompose();
  const installer = portsFromInstaller();

  it('read both files', () => {
    // A regex that stops matching turns every assertion below into a
    // comparison of two empty maps.
    expect(compose.size).toBeGreaterThan(5);
    expect(installer.size).toBeGreaterThan(5);
  });

  it.each([...compose.keys()])(
    '%s is a port the wizard checks, with the same default',
    (variable) => {
      expect(
        installer.get(variable),
        `docker-compose.yml publishes ${variable} (default ${compose.get(variable)}), and PUBLISHED_PORTS in create-ragen-app does not list it with that default. A port the wizard does not know about is a collision it cannot warn about.`,
      ).toBe(compose.get(variable));
    },
  );

  it('does not warn about a port nothing publishes', () => {
    for (const variable of installer.keys()) {
      expect(
        compose.has(variable),
        `create-ragen-app checks ${variable}, which docker-compose.yml no longer publishes.`,
      ).toBe(true);
    }
  });
});
