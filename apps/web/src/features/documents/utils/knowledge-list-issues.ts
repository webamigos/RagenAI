import {
  readDocumentDiagnostics,
  warningsOf,
} from '@ragenai/rag-core/document-diagnostics';
import type { UserFileType } from '../contracts/document.types';
import { canOptimizeDocument } from './tabular-documents';

export function optimizationEligible(file: UserFileType): boolean {
  return Boolean(
    file.document &&
    ['COMPLETED', 'WITHDRAWN', 'STAGED'].includes(file.embeddingStatus ?? '') &&
    canOptimizeDocument(file),
  );
}

/** Current visible page, never implied to summarize inaccessible or unloaded files. */
export function knowledgeListIssues(
  files: UserFileType[],
  diagnosticsEnabled: boolean,
) {
  return {
    headerless: diagnosticsEnabled
      ? files.filter((file) =>
          warningsOf(readDocumentDiagnostics(file.metadata)).some(
            (w) => w.check === 'table-without-header',
          ),
        )
      : [],
    noKnowledge: files.filter(
      (file) =>
        file.embeddingStatus === 'COMPLETED' &&
        file.brainCoverage &&
        file.brainCoverage.approved + file.brainCoverage.candidates === 0,
    ),
  };
}

/** Existing authenticated optimization endpoint; sequential, deduplicated and partial-result aware. */
export async function requestDocumentOptimizations(
  documentIds: string[],
  request: typeof fetch = fetch,
) {
  const results: { id: string; ok: boolean }[] = [];
  for (const id of new Set(documentIds)) {
    try {
      const response = await request(
        `/api/documents/${encodeURIComponent(id)}/optimize-suggestions`,
        { method: 'POST' },
      );
      results.push({ id, ok: response.ok });
    } catch {
      results.push({ id, ok: false });
    }
  }
  return results;
}
