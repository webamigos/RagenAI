'use server';

import db from '@ragenai/prisma-client';
import type { OrgVisibilityScope } from '@ragenai/platform-contracts';

import { buildUserFilesWhere, type FileViewMode } from './user-files-where';

/**
 * What a scope holds: how many files, and how many pages they add up to.
 *
 * `pages` is a sum of `UserFile.pageCount`, which is nullable — a file whose
 * ingest never reported one contributes nothing rather than a guess. It is
 * also approximate for a second reason the renderer has to carry: Docling
 * reports a real count for the formats that have pages, and markdown, plain
 * text and CSV are still `ceil(chars / 3000)`. One estimated file makes the
 * whole sum an estimate, so every rendering of it wears a tilde — see
 * `FoldersList`'s usage block, which explains the convention.
 */
export type FileScopeTotals = { files: number; pages: number };

export type FileScopeCounts = Record<FileViewMode, FileScopeTotals>;

const VIEW_MODES: readonly FileViewMode[] = [
  'all',
  'my-files',
  'shared-with-me',
];

const NONE: FileScopeTotals = { files: 0, pages: 0 };

const EMPTY: FileScopeCounts = {
  all: NONE,
  'my-files': NONE,
  'shared-with-me': NONE,
};

/**
 * What each scope in the knowledge base rail holds.
 *
 * Design system v2 phase 7 puts a count beside All files / My files / Shared
 * with me, and a "{n} documents · ~{m} pages" line under the page title. Two
 * things about it that are easy to get wrong:
 *
 * **It is access-scoped, through the same predicate the table uses.** Telling
 * a member the organization has 240 documents when they can reach three is a
 * disclosure, not a convenience — the same one #1006 and #1007 closed from the
 * other side. `buildUserFilesWhere` is shared rather than re-derived so the
 * count and the list cannot disagree about who may see what.
 *
 * **It ignores the selected folder and the active filters.** The count
 * describes the scope you would be switching *to*, so narrowing the current
 * view must not change it — a "Shared with me 0" that only means "no shared
 * file is also a PDF" would send people looking for a sharing bug.
 */
export async function getFileScopeCountsQuery(
  organizationId: string,
  userTeamIds: string[] = [],
  options?: {
    userId?: string;
    scope?: OrgVisibilityScope;
  },
): Promise<FileScopeCounts> {
  const { userId, scope = 'member' } = options ?? {};

  const entries = await Promise.all(
    VIEW_MODES.map(async (viewMode) => {
      const where = buildUserFilesWhere({
        organizationId,
        userId,
        scope,
        teamIds: userTeamIds,
        viewMode,
      });

      if (where === null) {
        return [viewMode, NONE] as const;
      }

      // One aggregate rather than a count and a sum: both answer the same
      // `where`, and issuing them separately is a second pass over the same
      // access-scoped join for a number rendered on the same line.
      const totals = await db.userFile.aggregate({
        where,
        _count: { _all: true },
        _sum: { pageCount: true },
      });

      return [
        viewMode,
        {
          files: totals._count._all,
          pages: totals._sum.pageCount ?? 0,
        },
      ] as const;
    }),
  );

  return entries.reduce<FileScopeCounts>(
    (acc, [viewMode, totals]) => ({ ...acc, [viewMode]: totals }),
    EMPTY,
  );
}
