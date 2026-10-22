import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { PII_CONTAINER_COMPOSE_FILE } from '../../packages/create-ragen-app/src/pii-masking';

/**
 * The container stack does not override the settings an operator owns.
 *
 * `docker-compose.fullapp.yml` hands every app the root `.env.local` with
 * `env_file:`, then applies its `environment:` block, which wins. That is
 * right for an address that differs inside the network (`postgres:5432` for
 * `localhost:55432`), and silently wrong for a setting the docs tell an
 * operator to put in `.env.local`. Two did exactly that:
 *
 * - `PRESIDIO_*_URL: ${PRESIDIO_*_URL:-}` and
 *   `FEATURE_FLAG_PII_MASKING: ${FEATURE_FLAG_PII_MASKING:-}` interpolate from
 *   Compose's `.env`, not `.env.local`, so they were empty on every install,
 *   and an empty `environment:` entry still beats `env_file:`. PII masking was
 *   off in containers for an operator who had turned it on.
 * - `APP_URL: http://localhost:${WEB_PORT:-3000}` could not be changed from
 *   either file, so every link in every email named localhost.
 *
 * Any form of these in `environment:` reintroduces one of the two: an empty
 * default switches masking off, a `${APP_URL:-…}` beats `.env.local`, and a
 * localhost literal names the wrong machine. So the rule is that they are
 * absent from the app services, not that their value looks plausible. The one
 * place the Presidio URLs are set for containers is the opt-in overlay, and
 * there they must be service names this stack defines.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

type Service = {
  environment?: Record<string, unknown> | string[];
  depends_on?: Record<string, unknown> | string[];
  profiles?: unknown;
};
type ComposeFile = { services?: Record<string, Service> };

const parse = (path: string): ComposeFile =>
  // `!reset` is Compose's own tag; the yaml library does not know it and is
  // told to keep the value rather than warn about it.
  parseYaml(read(path), {
    merge: true,
    customTags: [
      {
        tag: '!reset',
        collection: 'seq',
        resolve: () => [],
      },
    ],
  }) as ComposeFile;

/** `environment:` as a map, whichever of Compose's two spellings it uses. */
function environmentOf(service: Service): Record<string, unknown> {
  const env = service.environment;
  if (!env) {
    return {};
  }
  if (Array.isArray(env)) {
    return Object.fromEntries(
      env.map((entry) => {
        const [key, ...rest] = String(entry).split('=');
        return [key, rest.length ? rest.join('=') : null];
      }),
    );
  }
  return env;
}

const OPERATOR_OWNED = [
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'PRESIDIO_ANALYZER_URL',
  'PRESIDIO_ANONYMIZER_URL',
  'FEATURE_FLAG_PII_MASKING',
];

/** Every file a container install stacks on top of docker-compose.yml. */
const STACK_FILES = [
  'docker-compose.fullapp.yml',
  'docker-compose.appliance.yml',
  'docker-compose.appliance.gpu.yml',
  'docker-compose.appliance.sealed.yml',
];

describe('the container stack', () => {
  for (const file of STACK_FILES) {
    it(`${file} leaves the public origin and PII masking to .env.local`, () => {
      const offenders: string[] = [];
      for (const [name, service] of Object.entries(
        parse(file).services ?? {},
      )) {
        const env = environmentOf(service);
        for (const key of OPERATOR_OWNED) {
          if (key in env) {
            offenders.push(`${name}.environment.${key}: ${String(env[key])}`);
          }
        }
      }
      expect(
        offenders,
        `${file} sets an operator-owned variable under environment:, which ` +
          'wins over .env.local. Leave it to .env.local; for PII masking in ' +
          `containers, set the URLs in ${PII_CONTAINER_COMPOSE_FILE}.`,
      ).toEqual([]);
    });
  }
});

describe('the PII overlay', () => {
  const overlay = parse(PII_CONTAINER_COMPOSE_FILE);
  const base = parse('docker-compose.yml');

  it('is the file create-ragen-app tells a container install to add', () => {
    expect(existsSync(join(ROOT, PII_CONTAINER_COMPOSE_FILE))).toBe(true);
  });

  it('points web, api and worker at services the stack defines, never localhost', () => {
    for (const app of ['web', 'api', 'worker']) {
      const env = environmentOf(overlay.services?.[app] ?? {});
      for (const key of ['PRESIDIO_ANALYZER_URL', 'PRESIDIO_ANONYMIZER_URL']) {
        const value = env[key];
        expect(typeof value, `${app}.${key}`).toBe('string');
        const url = new URL(String(value));
        expect(url.hostname, `${app}.${key}`).not.toMatch(
          /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/,
        );
        // A service docker-compose.yml defines, on the port it listens on
        // inside the network — not the one it publishes on the host.
        expect(Object.keys(base.services ?? {}), `${app}.${key}`).toContain(
          url.hostname,
        );
        expect(url.port, `${app}.${key}`).toBe('3000');
      }
    }
  });

  it('starts both Presidio services without --profile pii', () => {
    for (const name of ['presidio-analyzer', 'presidio-anonymizer']) {
      expect(base.services?.[name]?.profiles).toEqual(['pii']);
      expect(overlay.services?.[name]?.profiles).toEqual([]);
      expect(read(PII_CONTAINER_COMPOSE_FILE)).toMatch(
        new RegExp(`${name}:\\n\\s+profiles: !reset \\[\\]`),
      );
    }
  });

  it('makes the two apps that mask wait for both halves', () => {
    for (const app of ['web', 'worker']) {
      expect(overlay.services?.[app]?.depends_on).toMatchObject({
        'presidio-analyzer': { condition: 'service_healthy' },
        'presidio-anonymizer': { condition: 'service_healthy' },
      });
    }
  });
});
