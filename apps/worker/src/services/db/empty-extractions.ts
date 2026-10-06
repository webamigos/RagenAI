import { hasPagesFromFile, recordExtractionFailed } from './brain.js';
import { getPrisma } from './prisma.js';

/**
 * Repair old zero-page successes during findings reconciliation. A resolved
 * extraction failure is evidence that extraction finished, unlike embedding
 * completion alone. Open findings are stable; dismissals remain a decision.
 */
export async function reconcileEmptyExtractions(
  orgId: string,
): Promise<number> {
  const prisma = getPrisma();
  const finished = await prisma.knowledgeFinding.findMany({
    where: {
      organizationId: orgId,
      type: 'EXTRACTION_FAILED',
      status: 'RESOLVED',
      fileId: { not: null },
    },
    distinct: ['fileId'],
    select: { fileId: true, detail: true },
  });
  const fileIds = finished.flatMap((finding) =>
    finding.fileId ? [finding.fileId] : [],
  );
  if (fileIds.length === 0) {
    return 0;
  }
  const [files, blocked] = await Promise.all([
    prisma.userFile.findMany({
      where: {
        organizationId: orgId,
        id: { in: fileIds },
        embeddingStatus: 'COMPLETED',
      },
      select: { id: true },
    }),
    prisma.knowledgeFinding.findMany({
      where: {
        organizationId: orgId,
        type: 'EXTRACTION_FAILED',
        status: { in: ['OPEN', 'DISMISSED'] },
        fileId: { in: fileIds },
      },
      select: { fileId: true },
    }),
  ]);
  const ready = new Set(files.map((file) => file.id));
  const skip = new Set(blocked.map((finding) => finding.fileId));
  let created = 0;
  for (const finding of finished) {
    const fileId = finding.fileId;
    if (
      !fileId ||
      !ready.has(fileId) ||
      skip.has(fileId) ||
      (await hasPagesFromFile({ orgId, fileId }))
    ) {
      continue;
    }
    const detail = finding.detail;
    const runId =
      detail !== null &&
      typeof detail === 'object' &&
      !Array.isArray(detail) &&
      typeof detail.runId === 'string'
        ? detail.runId
        : 'findings-reconcile';
    await recordExtractionFailed({
      orgId,
      fileId,
      detail: { reason: 'nothing_extracted', windowIndex: null, runId },
    });
    created += 1;
  }
  return created;
}
