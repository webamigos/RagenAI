import type { BrainDocument } from './brain-documents.types';
import type { KnowledgeFindingType } from './brain.types';

export type BrainOverview = {
  documents: number;
  emptyDocuments: number;
  candidates: number;
  approved: number;
  published: number;
  /**
   * What "publish all approved" would write now: new, changed or unfinished
   * pages it would not refuse. Organization-wide, whatever the language.
   */
  awaitingPublication: number;
  unownedCandidates: number;
  openFindings: Partial<Record<KnowledgeFindingType, number>>;
  topDocuments: BrainDocument[];
};
