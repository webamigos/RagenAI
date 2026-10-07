import type { BrainDocument } from '../contracts/brain-documents.types';
import type { BrainDocumentExtraction } from '../contracts/brain-document-extraction.types';
import { languageName } from './language-name';

export function documentExtractionState(
  document: BrainDocument,
  extraction?: BrainDocumentExtraction,
): 'processing' | 'failed' | 'empty' | 'extracted' | 'waiting' {
  if (document.retrieval === 'processing') {
    return 'processing';
  }
  if (extraction?.failure?.empty && !extraction.hasPages) {
    return 'empty';
  }
  if (extraction?.failure || document.retrieval === 'failed') {
    return 'failed';
  }
  if (
    extraction?.hasPages ||
    document.approvedPages + document.candidatePages > 0
  ) {
    return 'extracted';
  }
  return 'waiting';
}

/**
 * A paired file's twin follows it, wherever the sort put the twin; everything
 * else keeps its order. Sorting by language alone would put the Polish and the
 * English half of one document pages apart.
 */
function adjacentPairs(documents: BrainDocument[]): BrainDocument[] {
  const byId = new Map(documents.map((doc) => [doc.fileId, doc]));
  const placed = new Set<string>();
  const ordered: BrainDocument[] = [];
  for (const doc of documents) {
    if (placed.has(doc.fileId)) {
      continue;
    }
    placed.add(doc.fileId);
    ordered.push(doc);
    const twin = doc.pair ? byId.get(doc.pair.fileId) : undefined;
    if (twin && !placed.has(twin.fileId)) {
      placed.add(twin.fileId);
      ordered.push(twin);
    }
  }
  return ordered;
}

/** Shared scale covers every displayed file; language groups have no pairing semantics. */
export function summarizeBrainDocuments(
  documents: BrainDocument[],
  extraction: ReadonlyMap<string, BrainDocumentExtraction>,
  locale: string,
) {
  const sorted = [...documents].sort((a, b) => {
    if (a.language === null && b.language !== null) {
      return 1;
    }
    if (b.language === null && a.language !== null) {
      return -1;
    }
    const aLanguage = a.language ? languageName(a.language, locale) : '';
    const bLanguage = b.language ? languageName(b.language, locale) : '';
    return (
      aLanguage.localeCompare(bLanguage, locale) ||
      a.fileName.localeCompare(b.fileName, locale) ||
      a.fileId.localeCompare(b.fileId)
    );
  });
  return {
    documents: adjacentPairs(sorted),
    maxPages: Math.max(
      1,
      ...documents.map((d) => d.approvedPages + d.candidatePages),
    ),
    empty: documents.filter(
      (d) => documentExtractionState(d, extraction.get(d.fileId)) === 'empty',
    ).length,
    withdrawn: documents.filter((d) => d.retrieval === 'withdrawn').length,
  };
}
