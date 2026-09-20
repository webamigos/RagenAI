import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `McpConnector.provider` and `McpOAuthToken.provider` are being replaced by
 * `providerSlug` through an expand/contract, because web, api and admin deploy
 * independently and a column whose type changes in one release breaks whichever
 * service redeploys second.
 *
 * Step 1 is the one this guards: **every writer writes both columns.** A writer
 * that sets only `provider` leaves a row the next step cannot make `NOT NULL`,
 * and the failure is silent until the backfill is repeated or the migration
 * stalls. A writer that sets only `providerSlug` is worse while `provider` is
 * still required.
 *
 * Reading the source is deliberate: the write sites are spread over two apps
 * and six files, and mocking each one to observe its payload would still miss
 * the seventh someone adds.
 *
 * This test is deleted at B5, with the column.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SEARCH_ROOTS = ['apps/web/src', 'apps/api/src', 'apps/admin/src'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' || entry === 'generated'
        ? []
        : sources(full);
    }
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

/** The object literal that follows `create: {`, `update: {` or `data: {`. */
function writePayloads(source: string): string[] {
  const payloads: string[] = [];
  const opener = /\b(create|update|data):\s*\{/g;
  let match = opener.exec(source);

  while (match) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') {
        depth += 1;
      } else if (source[index] === '}') {
        depth -= 1;
      }
      index += 1;
    }
    payloads.push(source.slice(match.index + match[0].length, index - 1));
    match = opener.exec(source);
  }

  return payloads;
}

/** `provider,` or `provider: x` — but never `providerSlug` or `providerDef`. */
const SETS_PROVIDER = /(^|[\s{])provider\s*(,|:(?!\s*\{))/;
const SETS_SLUG = /(^|[\s{])providerSlug\s*(,|:)/;

describe('a write to a connector or its token', () => {
  const files = SEARCH_ROOTS.flatMap((root) => sources(join(REPO_ROOT, root)))
    .filter((file) => !file.includes('__tests__') && !file.includes('.test.'))
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /mcpConnector\.\w+|mcpOAuthToken\.\w+/.test(source);
    });

  it('has writers to check, so a rename cannot make this vacuous', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files.map((f) => [f.slice(REPO_ROOT.length + 1), f]))(
    'carries providerSlug beside provider in %s',
    (_relative, file) => {
      const offenders = writePayloads(readFileSync(file, 'utf8')).filter(
        (payload) => SETS_PROVIDER.test(payload) && !SETS_SLUG.test(payload),
      );

      expect(offenders).toEqual([]);
    },
  );
});
