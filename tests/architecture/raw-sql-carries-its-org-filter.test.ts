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

/**
 * The org column in a position that actually restricts which rows are touched.
 *
 * Naming the column somewhere in the statement is not enough: a
 * `SELECT id, organization_id … WHERE id = $1`, a `SET organization_id = …` or
 * a `RETURNING organization_id` all mention it while selecting rows by id
 * alone. Only a comparison inside the row-selection clause counts.
 */
const ORG_PREDICATE = /\b(?:organization_id|org_id)\s*(?:=|\bIN\s*\()/i;

/**
 * The part of a statement that decides which rows are touched: everything from
 * `WHERE` up to the first clause that no longer narrows the row set.
 *
 * `SET` sits before `WHERE`, and `RETURNING` after it, so both fall outside by
 * construction. `GROUP BY`/`HAVING` are cut off too — an aggregate filter is
 * not a row filter, and a statement whose only mention of the org is in a
 * `HAVING` should not pass.
 */
function rowSelectionClause(sql: string): string {
  const where = /\bWHERE\b/i.exec(sql);

  if (where === null) {
    return '';
  }

  const rest = sql.slice(where.index + where[0].length);
  const end =
    /\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|RETURNING|FOR\s+(?:UPDATE|SHARE|NO\s+KEY))\b/i.exec(
      rest,
    );

  return end === null ? rest : rest.slice(0, end.index);
}

/** Whether a statement restricts its rows by organisation. */
export function isOrgScoped(sql: string): boolean {
  return ORG_PREDICATE.test(rowSelectionClause(sql));
}

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

/**
 * The index of the backtick closing the template that opens at `start`.
 *
 * Not `indexOf('`')`: an interpolation can itself contain a template literal —
 * `deleteStaleThreads` builds an optional clause with
 * `Prisma.sql\`AND …\`` inside a `${…}` — and stopping at the first backtick
 * would cut the statement in half and hide whatever follows from this guard.
 */
function endOfTemplate(code: string, start: number): number {
  let depth = 0;

  for (let i = start + 1; i < code.length; i += 1) {
    const char = code[i];

    if (char === '\\') {
      i += 1;
    } else if (code.startsWith('${', i)) {
      depth += 1;
      i += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
    } else if (char === '`') {
      if (depth === 0) {
        return i;
      }
      // A nested template inside an interpolation: skip it whole.
      const nested = endOfTemplate(code, i);
      if (nested === -1) {
        return -1;
      }
      i = nested;
    }
  }

  return -1;
}

type Statement = { file: string; line: number; sql: string };

/** Every `$executeRaw`/`$queryRaw` tagged template, with its statement text. */
function rawStatements(): Statement[] {
  const found: Statement[] = [];

  for (const file of APP_SOURCE_ROOTS.flatMap(sourceFiles)) {
    const code = withoutComments(readFileSync(file, 'utf8'));
    // A generic type argument has to be allowed through — `$queryRaw<Row[]>\`…\``
    // is the common form, and an earlier version of this pattern required the
    // backtick to follow the method name directly, so it silently skipped call
    // sites written that way.
    //
    // `$queryRawUnsafe` is deliberately *not* matched. It takes a constructed
    // string, so the statement in the source is not the statement that runs:
    // `get-ai-usage-dashboard-query.ts` assembles its `WHERE` from an array of
    // conditions, and no text scan can tell whether an org predicate is among
    // them. Judging those needs a human. That one was read by hand while this
    // guard was written: its only caller takes the org from the session and
    // overwrites any client-supplied value, so the unscoped branch is
    // unreachable.
    const pattern = /\$(?:execute|query)Raw\s*(?:<[^<>`]*>)?\s*`/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(code)) !== null) {
      const open = match.index + match[0].length - 1;
      const close = endOfTemplate(code, open);
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
        return touched && !isOrgScoped(sql);
      })
      .map(
        ({ file, line, sql }) =>
          `${file}:${line} — ${sql.trim().split('\n')[0].trim()}`,
      );

    expect(offenders).toEqual([]);
  });
});

// The rule itself, fed statements directly. The scan above can only find what
// exists in the repository today; these pin the shapes that must *not* count
// as scoped, which is what the earlier version of this guard got wrong — it
// looked for the column anywhere in the statement.
describe('what counts as scoped by organisation', () => {
  it.each([
    [
      'a WHERE equality',
      'UPDATE user_files SET x = 1 WHERE organization_id = $1',
    ],
    [
      'an aliased column',
      'SELECT t.id FROM threads t WHERE t.organization_id = $1',
    ],
    ['an IN list', 'DELETE FROM threads WHERE organization_id IN ($1, $2)'],
    [
      'one predicate among several',
      'UPDATE user_documents SET metadata = $1 WHERE id = $2::uuid AND organization_id = $3',
    ],
    [
      'a predicate before ORDER BY and a lock',
      'SELECT id FROM threads WHERE organization_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE',
    ],
  ])('accepts %s', (_label, sql) => {
    expect(isOrgScoped(sql)).toBe(true);
  });

  it.each([
    ['a bare id lookup', 'SELECT id FROM user_files WHERE id = $1'],
    [
      'the column merely selected',
      'SELECT id, organization_id FROM user_files WHERE id = $1',
    ],
    [
      'the column merely assigned',
      'UPDATE user_files SET organization_id = $1 WHERE id = $2',
    ],
    [
      'the column merely returned',
      'UPDATE user_files SET x = 1 WHERE id = $1 RETURNING organization_id',
    ],
    [
      'the column only in a HAVING',
      'SELECT id FROM threads WHERE id = $1 GROUP BY id HAVING organization_id = $2',
    ],
    ['no WHERE at all', 'DELETE FROM user_files'],
  ])('rejects %s', (_label, sql) => {
    expect(isOrgScoped(sql)).toBe(false);
  });
});
