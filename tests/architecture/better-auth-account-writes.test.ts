import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Better Auth owns the `accounts` table, and it looks a credential account up
 * by three fields at once:
 *
 *   providerId === 'credential'
 *   && issuer === createLocalAccountIssuer('credential')  // 'local:credential'
 *   && accountId === user.id
 *
 * 1.4 matched on `providerId` alone. When 1.7 started reading the other two,
 * the E2E seed — which writes that row directly with Prisma rather than through
 * the library — stopped matching, and every auth spec timed out on the
 * post-login redirect. Nothing caught it: both columns are valid per the Prisma
 * schema (`issuer` nullable, `accountId` a free-text String), so typecheck,
 * lint and migrations all passed. See
 * docs/lessons/seeded-rows-must-satisfy-the-librarys-lookup.md.
 *
 * This is the tripwire for that class of bug. It is deliberately narrow: it
 * does not police every write to a library-owned table (there are dozens, and
 * most touch columns the library never queries), only the creation of `account`
 * rows, where the row is worthless unless it satisfies a lookup written
 * somewhere else entirely.
 */

const REQUIRED_FIELDS = ['providerId', 'issuer', 'accountId'] as const;

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** `.account.create(` / `.account.upsert(` / `.account.createMany(` */
const ACCOUNT_WRITE = /\.account\.(create|upsert|createMany)\s*\(/g;

/**
 * Tracked files only, so a stray build artefact or a local scratch file cannot
 * fail the suite. Excludes the generated Prisma client, whose doc comments are
 * full of example calls, and this file.
 */
function candidateFiles(): string[] {
  const tracked = execFileSync(
    'git',
    ['ls-files', '-z', '*.ts', '*.tsx', '*.mts', '*.cts'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
    .split('\0')
    .filter(Boolean);

  return tracked.filter(
    (path) =>
      !path.includes('/generated/') &&
      !path.endsWith('better-auth-account-writes.test.ts'),
  );
}

/**
 * The argument to the write call, read by balancing brackets from the opening
 * parenthesis. A fixed-size window would either miss fields in a long call or
 * bleed into the next statement.
 */
function callArgument(source: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '(' || char === '{' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParenIndex, i + 1);
      }
    }
  }
  return source.slice(openParenIndex);
}

type AccountWrite = {
  location: string;
  argument: string;
};

function findAccountWrites(): AccountWrite[] {
  const writes: AccountWrite[] = [];

  for (const path of candidateFiles()) {
    const source = readFileSync(join(REPO_ROOT, path), 'utf8');
    if (!source.includes('.account.')) {
      continue;
    }

    for (const match of source.matchAll(ACCOUNT_WRITE)) {
      const openParen = source.indexOf('(', match.index);
      const line = source.slice(0, match.index).split('\n').length;
      writes.push({
        location: `${path}:${line}`,
        argument: callArgument(source, openParen),
      });
    }
  }

  return writes;
}

describe('direct writes to the Better Auth accounts table', () => {
  it('set every field the library matches on', () => {
    const offenders = findAccountWrites()
      .map((write) => ({
        location: write.location,
        missing: REQUIRED_FIELDS.filter(
          (field) => !new RegExp(`\\b${field}\\s*:`).test(write.argument),
        ),
      }))
      .filter((write) => write.missing.length > 0);

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : [
            'An account row was created without every field Better Auth matches on.',
            'A row missing any of them cannot sign in, and updatePassword —',
            'which filters on the same fields — updates zero rows and reports',
            'success. Prefer going through the library; if you must write the',
            'row directly, set all of them:',
            '',
            ...offenders.map(
              (o) => `  ${o.location} — missing ${o.missing.join(', ')}`,
            ),
          ].join('\n'),
    ).toEqual([]);
  });

  it('finds the writes it is meant to police, so the check cannot silently pass', () => {
    // If a refactor moves the seed or renames the client, this test would
    // otherwise keep passing while checking nothing at all.
    expect(findAccountWrites().length).toBeGreaterThan(0);
  });
});
