import type { OrgVisibilityScope } from '@ragenai/platform-contracts';

import { fileAccessWhere } from './document-access';
import {
  type FileType,
  type EmbeddingStatus,
  type PiiPolicy,
} from '@/generated/prisma/client';

export type FileViewMode = 'all' | 'my-files' | 'shared-with-me';

export type UserFilesWhereOptions = {
  organizationId: string;
  userId?: string;
  scope?: OrgVisibilityScope;
  teamIds?: string[];
  /**
   * Omit it entirely to search every folder; `null` means the files that sit
   * in no folder at all. The two are different questions and Prisma reads
   * `undefined` as "no condition", so the distinction is load-bearing.
   */
  folderId?: string | null;
  viewMode?: FileViewMode;
  fileType?: FileType[];
  embeddingStatus?: EmbeddingStatus[];
  piiPolicy?: PiiPolicy[];
};

/**
 * The one predicate that decides which files a person may see.
 *
 * It is shared rather than restated because the file list and the scope counts
 * beside it have to agree: a rail saying "Shared with me 14" over a table
 * showing three files is a bug report, and two copies of an access rule are
 * how the counts would come to be computed by a predicate nobody audited.
 *
 * Returns `null` for "this person can see nothing in this view" — a case that
 * has to be refused rather than translated into a `where`, because Prisma
 * drops a condition whose value is `undefined`. `ownerId: undefined` would
 * widen "my files" to *every* file in the organization, and
 * `granteeId: undefined` would make "shared with me" match any grant to
 * anyone.
 */
export function buildUserFilesWhere(
  options: UserFilesWhereOptions,
): Record<string, unknown> | null {
  const {
    organizationId,
    userId,
    scope = 'member',
    teamIds = [],
    folderId,
    viewMode = 'all',
    fileType = [],
    embeddingStatus = [],
    piiPolicy = [],
  } = options;

  if ((viewMode === 'my-files' || viewMode === 'shared-with-me') && !userId) {
    return null;
  }

  // Before any view-mode branching: `my-files` and `shared-with-me` build
  // their own predicate and never consult the scope, so a non-member would
  // otherwise still get a query. There is nothing for them in any view.
  if (scope === 'none') {
    return null;
  }

  const baseWhere: Record<string, unknown> = { organizationId };

  if (folderId !== undefined) {
    baseWhere.folderId = folderId;
  }

  if (fileType.length > 0) {
    baseWhere.fileType = { in: fileType };
  }

  if (embeddingStatus.length > 0) {
    baseWhere.embeddingStatus = { in: embeddingStatus };
  }

  if (piiPolicy.length > 0) {
    baseWhere.piiPolicy = { in: piiPolicy };
  }

  if (viewMode === 'my-files') {
    baseWhere.ownerId = userId;
  } else if (viewMode === 'shared-with-me') {
    baseWhere.ownerId = { not: null, notIn: [userId] };

    const permissionConditions = [
      {
        permissions: {
          some: { granteeType: 'user', granteeId: userId },
        },
      },
      ...(teamIds.length > 0
        ? [
            {
              permissions: {
                some: {
                  granteeType: 'team',
                  granteeId: { in: teamIds },
                },
              },
            },
          ]
        : []),
      {
        folder: {
          permissions: {
            some: { granteeType: 'user', granteeId: userId },
          },
        },
      },
      ...(teamIds.length > 0
        ? [
            {
              folder: {
                permissions: {
                  some: {
                    granteeType: 'team',
                    granteeId: { in: teamIds },
                  },
                },
              },
            },
          ]
        : []),
    ];

    baseWhere.OR = permissionConditions;
  } else if (scope !== 'organization') {
    // Composed, not restated. This branch used to spell the predicate out and
    // omitted folder-level grants, so sharing a folder showed the file under
    // "Shared with me" and nowhere the user actually browses.
    Object.assign(
      baseWhere,
      fileAccessWhere({
        userId: userId ?? null,
        teamIds,
        scope,
      }),
    );
  }

  return baseWhere;
}
