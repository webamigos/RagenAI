import type { BrainDocument } from './brain-documents.types';
import type { KnowledgeFindingType } from './brain.types';

export type BrainOverview = {
  documents: number;
  emptyDocuments: number;
  candidates: number;
  approved: number;
  published: number;
  approvedUnpublished: number;
  unownedCandidates: number;
  openFindings: Partial<Record<KnowledgeFindingType, number>>;
  topDocuments: BrainDocument[];
};
