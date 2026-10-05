import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_ROUTES } from '../../packages/ragen-cli/src/routes';
import { REPO_ROOT, readSource, trackedFiles } from './tracked-files';

/**
 * Every route `ragen-cli` calls is one apps/api declares.
 *
 * The CLI is published standalone and shares no contract with apps/api, so
 * nothing else connects the two: renaming `/v1/files` or moving `/v1/search`
 * would leave both suites green and every installed CLI answering 404. The
 * CLI's half of the bargain — that `API_ROUTES` is exactly what its commands
 * call — is its own test (packages/ragen-cli/src/__tests__/routes.test.ts);
 * this is the other half.
 *
 * Read as text: `@Controller('x')` sets the prefix for the method decorators
 * that follow it in the same file, and every path parameter is compared as
 * `:id`, whatever it is named.
 */

const API_SRC = join('apps', 'api', 'src');
const DECORATOR =
  /@(Controller|Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)")?/g;

function normalize(method: string, path: string): string {
  const clean = `/${path}`
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:\w+/g, ':id');
  return `${method.toUpperCase()} ${clean}`;
}

function declaredRoutes(): Set<string> {
  const routes = new Set<string>();
  const files = trackedFiles({ under: API_SRC, extensions: ['.ts'] }).filter(
    (file) => !file.endsWith('.spec.ts') && !file.includes('__tests__'),
  );
  for (const file of files) {
    let prefix = '';
    for (const match of readSource(file).matchAll(DECORATOR)) {
      const [, kind, single, double] = match;
      const path = single ?? double ?? '';
      if (kind === 'Controller') {
        prefix = path;
      } else {
        routes.add(normalize(kind!, `v1/${prefix}/${path}`));
      }
    }
  }
  return routes;
}

describe('the CLI calls routes the API has', () => {
  it('serves the API under /v1, which the comparison assumes', () => {
    expect(readSource(join(REPO_ROOT, API_SRC, 'main.ts'))).toMatch(
      /setGlobalPrefix\(\s*'v1'\s*\)/,
    );
  });

  it('declares every route in ragen-cli’s API_ROUTES', () => {
    const declared = declaredRoutes();
    const missing = API_ROUTES.filter(
      (route) =>
        !declared.has(normalize(...(route.split(' ') as [string, string]))),
    );
    expect(
      missing,
      'ragen-cli calls these and no apps/api controller declares them. ' +
        'Either the route moved (update the CLI and packages/ragen-cli/src/routes.ts) ' +
        'or it was removed — which breaks every installed CLI that calls it.',
    ).toEqual([]);
  });

  it('reads the controllers at all', () => {
    // A guard that parses nothing passes everything.
    expect(declaredRoutes().size).toBeGreaterThan(50);
  });
});
