import { describe, expect, it } from 'vitest';

import { readSource, trackedFiles } from './tracked-files';

/**
 * A code path that changes who may read a file must start the access sync.
 *
 * `metadata.accessible_by` on a file's vector points is the retrieval filter,
 * and it is written at ingest. What keeps it equal to who may read the file
 * afterwards is the worker's `syncDocumentAccess` job, which a producer starts
 * once its change has committed (#1245). Nothing but a producer remembering can
 * start it, and a producer that forgets leaves a revoked principal retrieving
 * the document — silently, with every listing correct. That is the failure this
 * issue was filed for, and it was open for weeks because the code that should
 * have called the sync had no caller and no test said so.
 *
 * This reads source as text, like its neighbours. It finds the writes that
 * decide who may read a file:
 *
 *  - any write to `documentPermission`;
 *  - a `userFile` update whose `data` names `folderId`, `ownerId` or `isOrgWide`;
 *  - a `documentFolder` update whose `data` names `teamId`, `parentId`, `path`,
 *    `ownerId` or `isOrgWide`;
 *  - raw SQL that does the same;
 *
 * and requires the file that makes one to mention the sync (`afterChange(` on
 * apps/api's `DocumentAccessSyncService`, or the job name). The check is per
 * file, not per call: it cannot prove the call follows the write, which the
 * service specs assert, but it makes the omission — the thing that actually
 * happened — a red build.
 *
 * Creates are not listed: a new file is ingested, and ingest computes the
 * principals itself. Deletes are not listed either: the delete path removes the
 * points.
 */

const SCANNED = ['apps', 'packages'] as const;

const SKIPPED_DIRS = [
  'node_modules',
  'dist',
  '.next',
  'generated',
  '__tests__',
  'test',
  'e2e',
  'perf',
  'evals',
] as const;

/**
 * Writes that change `ownerId` or `isOrgWide` on a file that is **not** an
 * ordinary document, with the reason each is safe. Each is exact: a new entry
 * is a decision to be made out loud.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  'apps/web/src/features/brain/services/commands/publish-knowledge-page-command.ts':
    "A published Brain page's file. Its chunks carry `brain_generation`, which the sync skips, and its readers are the page's `accessibleBy`, which `brainPublishPage` writes by clearing and re-publishing.",
  'apps/web/src/features/brain/services/commands/set-knowledge-page-access-command.ts':
    'Same: the page owns who reads its chunks, and an access change re-publishes them.',
  'apps/web/src/features/brain/services/commands/set-knowledge-page-owner-command.ts':
    'Same: the page file mirrors the page owner; its chunks are the page’s to write.',
};

const PRISMA_CALL =
  /\b(documentPermission|userFile|documentFolder)\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\(/g;

// `key:`, or the shorthand `{ key }` / `{ key, other }` — both are in use.
const FILE_FIELDS = /\b(folderId|ownerId|isOrgWide)\b\s*[:,}]/;
const FOLDER_FIELDS = /\b(teamId|parentId|path|ownerId|isOrgWide)\b\s*[:,}]/;

const RAW_SQL =
  /(UPDATE\s+(user_files|document_folders)\b[\s\S]{0,400}?\bSET\b[\s\S]{0,300}?\b(owner_id|folder_id|is_org_wide|team_id|parent_id|path)\b|(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+document_permissions\b)/i;

const STARTS_THE_SYNC = /afterChange\(|syncDocumentAccess/;

/** The text of the balanced `(...)` or `{...}` that opens at `from`. */
function balanced(source: string, from: number): string {
  const open = source[from];
  const close = open === '(' ? ')' : open === '{' ? '}' : '';
  let depth = 0;

  for (let i = from; i < source.length; i += 1) {
    if (source[i] === open) {
      depth += 1;
    } else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(from, i + 1);
      }
    }
  }

  return source.slice(from);
}

/** The `data: { ... }` argument of a Prisma call, or '' when there is none. */
function dataOf(call: string): string {
  const match = /\bdata\s*:\s*\{/.exec(call);

  return match ? balanced(call, match.index + match[0].length - 1) : '';
}

export function accessWritesIn(source: string): string[] {
  const found: string[] = [];

  for (const match of source.matchAll(PRISMA_CALL)) {
    const [, model, method] = match;
    const call = balanced(source, match.index + match[0].length - 1);

    if (model === 'documentPermission') {
      found.push(`${model}.${method}`);
      continue;
    }

    if (method.startsWith('delete') || method.startsWith('create')) {
      continue;
    }

    const data = dataOf(call);
    const fields = model === 'userFile' ? FILE_FIELDS : FOLDER_FIELDS;
    if (fields.test(data)) {
      found.push(`${model}.${method}`);
    }
  }

  if (RAW_SQL.test(source)) {
    found.push('raw SQL');
  }

  return found;
}

describe('accessWritesIn', () => {
  it('finds a grant being revoked', () => {
    expect(
      accessWritesIn(
        'await this.prisma.client.documentPermission.delete({ where: { id } });',
      ),
    ).toEqual(['documentPermission.delete']);
  });

  it('finds a file being moved, but not one being renamed', () => {
    expect(
      accessWritesIn(
        'await db.userFile.update({ where: { id }, data: { folderId } });',
      ),
    ).toEqual(['userFile.update']);
    expect(
      accessWritesIn(
        'await db.userFile.update({ where: { id }, data: { fileName } });',
      ),
    ).toEqual([]);
  });

  it('reads only the data, not the where — a lookup by owner is not a change of owner', () => {
    expect(
      accessWritesIn(
        'await db.userFile.updateMany({ where: { ownerId: u }, data: { piiPolicy } });',
      ),
    ).toEqual([]);
  });

  it('finds a folder moved or given a team, but not renamed', () => {
    expect(
      accessWritesIn(
        'await tx.documentFolder.update({ where: { id }, data: { parentId, path } });',
      ),
    ).toEqual(['documentFolder.update']);
    expect(
      accessWritesIn(
        'await db.documentFolder.update({ where: { id }, data: { teamId } });',
      ),
    ).toEqual(['documentFolder.update']);
    expect(
      accessWritesIn(
        'await db.documentFolder.update({ where: { id }, data: { name } });',
      ),
    ).toEqual([]);
  });

  it('ignores creates and deletes of files and folders', () => {
    expect(
      accessWritesIn(
        'await db.userFile.create({ data: { ownerId, folderId } }); await db.userFile.deleteMany({ where: { folderId } });',
      ),
    ).toEqual([]);
  });

  it('finds raw SQL that sets who owns a file', () => {
    expect(
      accessWritesIn(
        'await db.$executeRaw`UPDATE user_files SET owner_id = ${u} WHERE id = ${f}`;',
      ),
    ).toEqual(['raw SQL']);
    expect(
      accessWritesIn(
        "await db.$executeRaw`UPDATE user_files SET metadata = metadata || '{}'::jsonb WHERE id = ${f}`;",
      ),
    ).toEqual([]);
  });
});

describe('every code path that changes who may read a file starts the sync', () => {
  const sources = trackedFiles({
    under: SCANNED,
    extensions: ['.ts', '.tsx'],
    skipDirs: SKIPPED_DIRS,
    relativePaths: true,
  }).filter((path) => !/\.(test|spec)\.tsx?$/.test(path));

  it('finds the writers it is meant to guard', () => {
    const writers = sources.filter(
      (path) => accessWritesIn(readSource(path)).length > 0,
    );

    // If this is empty the scan is broken, not the code clean.
    expect(writers).toContain(
      'apps/api/src/documents/document-permissions.service.ts',
    );
    expect(writers).toContain('apps/api/src/documents/folders.service.ts');
    expect(writers).toContain('apps/api/src/documents/files.service.ts');
  });

  it('has each of them start the access sync, or say why it need not', () => {
    const offenders = sources
      .map((path) => ({ path, writes: accessWritesIn(readSource(path)) }))
      .filter(({ writes }) => writes.length > 0)
      .filter(({ path }) => !(path in EXEMPT))
      .filter(({ path }) => !STARTS_THE_SYNC.test(readSource(path)))
      .map(({ path, writes }) => `${path}: ${[...new Set(writes)].join(', ')}`);

    expect(
      offenders,
      'these write who may read a file and never start the syncDocumentAccess job. ' +
        "Call DocumentAccessSyncService.afterChange(orgId, { fileIds | folderIds }) once the change has committed, or add the file to EXEMPT here with the reason it need not (#1245). Otherwise a revoked principal keeps retrieving the file's chunks.",
    ).toEqual([]);
  });

  it('keeps no exemption for a file that no longer writes access', () => {
    const stale = Object.keys(EXEMPT).filter(
      (path) =>
        !sources.includes(path) ||
        accessWritesIn(readSource(path)).length === 0,
    );

    expect(
      stale,
      'an exemption nothing needs any more hides the next writer that reuses the path',
    ).toEqual([]);
  });
});
