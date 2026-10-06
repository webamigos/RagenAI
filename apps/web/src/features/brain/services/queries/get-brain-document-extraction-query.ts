import db from '@ragenai/prisma-client';
import type { BrainDocumentExtraction } from '../../contracts/brain-document-extraction.types';

/** Evidence for visible files only; embedding completion alone proves no extraction. */
export async function getBrainDocumentExtractionQuery(
  orgId: string,
  fileIds: string[],
): Promise<Map<string, BrainDocumentExtraction>> {
  if (fileIds.length === 0) {
    return new Map();
  }
  const where = { organizationId: orgId, fileId: { in: fileIds } };
  const [sources, failures] = await Promise.all([
    db.knowledgePageSource.findMany({
      where,
      distinct: ['fileId'],
      select: { fileId: true },
    }),
    db.knowledgeFinding.findMany({
      where: { ...where, type: 'EXTRACTION_FAILED', status: 'OPEN' },
      select: { fileId: true, publicId: true, detail: true },
    }),
  ]);
  const result = new Map<string, BrainDocumentExtraction>(
    fileIds.map((id) => [id, { hasPages: false, failure: null }]),
  );
  for (const source of sources) {
    const evidence = result.get(source.fileId);
    if (evidence) {
      evidence.hasPages = true;
    }
  }
  for (const finding of failures) {
    const evidence = finding.fileId ? result.get(finding.fileId) : undefined;
    if (evidence) {
      const detail = finding.detail;
      evidence.failure = {
        publicId: finding.publicId,
        empty:
          detail !== null &&
          typeof detail === 'object' &&
          !Array.isArray(detail) &&
          detail.reason === 'nothing_extracted',
      };
    }
  }
  return result;
}
