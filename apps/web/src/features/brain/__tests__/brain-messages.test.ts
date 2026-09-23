import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The Brain panel's strings exist, in every locale.
 *
 * `next-intl` keys are not typed in this app, and the repository's parity
 * guard reads only `useTranslations` in client files and only en/pl. These
 * components are mostly server ones using `getTranslations`, so without this
 * a missing key renders as its own path in thirteen languages and nothing
 * fails.
 */
const WEB = join(import.meta.dirname, '..', '..', '..', '..');
const MESSAGES = join(WEB, 'src', 'app', 'messages');
const ROUTES = join(WEB, 'src', 'app', '[locale]', '(panel)', 'brain');

type Tree = { [key: string]: string | Tree };
const load = (locale: string) =>
  JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8')) as Tree;

function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : leaves(v, `${prefix}${k}.`),
  );
}

function at(tree: Tree, path: string): string | Tree | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) {
      return undefined;
    }
    node = node[part];
  }
  return node;
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const locales = readdirSync(MESSAGES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5));
const en = load('en');

describe('Brain messages', () => {
  it('has the same keys in every locale', () => {
    const reference = leaves(en.brain as Tree).sort();
    for (const locale of locales) {
      const tree = load(locale);
      expect(leaves(tree.brain as Tree).sort(), locale).toEqual(reference);
      expect(at(tree, 'sidebar.nav.brain'), locale).toEqual(expect.any(String));
    }
  });

  it('defines every key the Brain components use', () => {
    const missing: string[] = [];
    for (const file of files(ROUTES).filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(file, 'utf8');
      const namespaces = [
        ...source.matchAll(/(?:get|use)Translations\('([^']+)'\)/g),
      ].map((m) => m[1]!);
      if (namespaces.length === 0) {
        continue;
      }
      expect(new Set(namespaces).size, file).toBe(1);
      const ns = namespaces[0]!;
      for (const m of source.matchAll(/\bt\(\s*[`']([^`']+)[`']/g)) {
        const key = m[1]!;
        const dynamic = key.indexOf('${');
        const path = `${ns}.${dynamic === -1 ? key : key.slice(0, dynamic).replace(/\.$/, '')}`;
        const node = at(en, path);
        const ok =
          dynamic === -1 ? typeof node === 'string' : typeof node === 'object';
        if (!ok) {
          missing.push(`${file.slice(ROUTES.length)}: ${path}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // A dynamic key is checked only as far as its prefix; its values are the
  // schema's enums, so each enum must be spelled out in full.
  it('names every status, type, severity and origin', () => {
    const brain = en.brain as Tree;
    expect(Object.keys(at(brain, 'page-status') as Tree).sort()).toEqual([
      'APPROVED',
      'CANDIDATE',
      'REJECTED',
      'STALE',
    ]);
    expect(Object.keys(at(brain, 'page-type') as Tree).sort()).toEqual([
      'ENTITY',
      'POLICY',
      'PROCESS',
      'PRODUCT',
      'ROLE',
    ]);
    expect(Object.keys(at(brain, 'findings.type') as Tree).sort()).toEqual([
      'CONTRADICTION',
      'EXTRACTION_FAILED',
      'GAP',
      'ORPHAN',
      'STALE',
      'UNOWNED',
    ]);
    expect(Object.keys(at(brain, 'findings.severity') as Tree).sort()).toEqual([
      'HIGH',
      'LOW',
      'MEDIUM',
    ]);
    expect(Object.keys(at(brain, 'origin') as Tree).sort()).toEqual([
      'AMBIGUOUS',
      'EXTRACTED',
      'INFERRED',
    ]);
  });
});
