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
    documents: sorted,
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
