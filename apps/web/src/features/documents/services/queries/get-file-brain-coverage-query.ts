import 'server-only';
import db from '@ragenai/prisma-client';

/** Only IDs already authorized by the file listing; duplicate quotes count once. */
export async function getFileBrainCoverageQuery(
  orgId: string,
  fileIds: string[],
) {
  const coverage = new Map<string, { approved: number; candidates: number }>();
  if (!fileIds.length) {
    return coverage;
  }
  const [approved, candidates] = await Promise.all(
    (['APPROVED', 'CANDIDATE'] as const).map((status) =>
      db.knowledgePageSource.groupBy({
        by: ['fileId', 'pageId'],
        where: {
          organizationId: orgId,
          fileId: { in: fileIds },
          sourceDeletedAt: null,
          page: { organizationId: orgId, status },
        },
      }),
    ),
  );
  for (const id of fileIds) {
    coverage.set(id, { approved: 0, candidates: 0 });
  }
  for (const [rows, key] of [
    [approved, 'approved'],
    [candidates, 'candidates'],
  ] as const) {
    for (const row of rows) {
      const counts = coverage.get(row.fileId);
      if (counts) {
        counts[key]++;
      }
    }
  }
  return coverage;
}
