import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { TENANT_SCOPED_MODELS } from '@ragenai/platform-contracts';
import { describe, expect, it } from 'vitest';

/**
 * A raw SQL statement touching a tenant-scoped table must name its org column.
 *
 * The tenant-scope guard is a Prisma Client Extension. It inspects the `where`
 * object of a query, so it sees nothing at all inside `$executeRaw` or
 * `$queryRaw` — the statement is opaque to it. That is the same blind spot the
 * worker's knex layer had, and the one [ADR-40](../../docs/adrs/40-worker-uses-prisma-not-knex.md)
 * set out to close.
 *
 * Most of those queries became ordinary Prisma calls, which the guard covers.
 * A few cannot: `||` and `jsonb_set` merge a JSONB document server-side in one
 * statement, and the Prisma equivalent is read-modify-write, which loses a
 * concurrent patch. Those stay in SQL deliberately.
 *
 * So the check moves from runtime to build time for exactly those. For a fixed
 * set of hand-written statements this is the stronger of the two: it fails the
 * build instead of logging a warning into a stream nobody reads, and it fails
 * on the statement that is wrong rather than on the query that happened to run.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const APP_SOURCE_ROOTS = [
  'apps/web/src',
  'apps/api/src',
  'apps/admin/src',
  'apps/worker/src',
].map((p) => join(REPO_ROOT, p));

/** Either spelling of the org column that appears in this schema. */
const ORG_COLUMN = /\borganization_id\b|\borg_id\b/;

/**
 * The tables the guard covers, derived from the same model map the runtime
 * extension uses — so a model gaining tenant scoping is covered here too,
 * without a second list to keep in step.
 */
function tenantScopedTables(): Set<string> {
  const schema = readFileSync(
    join(REPO_ROOT, 'prisma', 'schema.prisma'),
    'utf8',
  );
  const tables = new Set<string>();

  for (const model of Object.keys(TENANT_SCOPED_MODELS)) {
    const block = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(
      schema,
    );
    const mapped = block ? /@@map\("([^"]+)"\)/.exec(block[1]) : null;
    // A model with no @@map is stored under its own name.
    tables.add(mapped ? mapped[1] : model);
  }

  return tables;
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Generated clients declare these methods; they do not call them. Tests
      // assert against the statements rather than issuing them.
      return entry.name === 'generated' || entry.name === '__tests__'
        ? []
        : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Comments are stripped: this file's own prose quotes the method names. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

type Statement = { file: string; line: number; sql: string };

/** Every `$executeRaw`/`$queryRaw` tagged template, with its statement text. */
function rawStatements(): Statement[] {
  const found: Statement[] = [];

  for (const file of APP_SOURCE_ROOTS.flatMap(sourceFiles)) {
    const code = withoutComments(readFileSync(file, 'utf8'));
    const pattern = /\$(?:execute|query)Raw(?:Unsafe)?\s*`/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(code)) !== null) {
      const open = match.index + match[0].length - 1;
      const close = code.indexOf('`', open + 1);
      if (close === -1) {
        continue;
      }
      found.push({
        file: file.replace(`${REPO_ROOT}/`, ''),
        line: code.slice(0, match.index).split('\n').length,
        sql: code.slice(open + 1, close),
      });
      pattern.lastIndex = close;
    }
  }

  return found;
}

describe('raw SQL carries its org filter', () => {
  const statements = rawStatements();
  const tables = tenantScopedTables();

  it('derives the covered tables from the shared model map', () => {
    expect(tables.size).toBe(Object.keys(TENANT_SCOPED_MODELS).length);
    expect(tables.has('user_documents')).toBe(true);
    expect(tables.has('user_files')).toBe(true);
  });

  it('finds the raw statements, so a rewrite cannot pass vacuously', () => {
    expect(statements.length).toBeGreaterThan(0);
  });

  it('names an org column in every statement touching a tenant-scoped table', () => {
    const offenders = statements
      .filter(({ sql }) => {
        const touched = [...tables].some((table) =>
          new RegExp(`\\b${table}\\b`).test(sql),
        );
        return touched && !ORG_COLUMN.test(sql);
      })
      .map(
        ({ file, line, sql }) =>
          `${file}:${line} — ${sql.trim().split('\n')[0].trim()}`,
      );

    expect(offenders).toEqual([]);
  });
});
