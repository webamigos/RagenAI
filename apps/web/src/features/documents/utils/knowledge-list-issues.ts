import {
  readDocumentDiagnostics,
  warningsOf,
} from '@ragenai/rag-core/document-diagnostics';
import type { PiiPolicy, UserFileType } from '../contracts/document.types';
import { canOptimizeDocument } from './tabular-documents';
import { piiInconsistency } from './document-pair';

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

export type PairPolicyRaise = {
  /** The weaker file of a pair, which is the one to change. */
  fileId: string;
  raiseTo: PiiPolicy;
};

/**
 * Pairs on the visible page whose two files mask differently, each as the one
 * change that would make them agree: raise the weaker file to the stricter
 * policy (ADR-54). Never a lowering. A pair with both files on the page is
 * listed once.
 */
export function pairPolicyRaises(files: UserFileType[]): PairPolicyRaise[] {
  const raises = new Map<string, PairPolicyRaise>();
  for (const file of files) {
    if (!file.pairedWith || !file.piiPolicy) {
      continue;
    }
    const gap = piiInconsistency(file.piiPolicy, file.pairedWith.piiPolicy);
    if (gap) {
      const fileId = gap.weaker === 'first' ? file.id : file.pairedWith.id;
      raises.set(fileId, { fileId, raiseTo: gap.raiseTo });
    }
  }
  return [...raises.values()];
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
