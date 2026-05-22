import type {
  LeadList,
  Lead,
  LeadEnrichmentStatus,
  LeadScoringStatus,
} from '@/generated/prisma/client';
import type { LeadColumn } from './lead-column.types';

// Stable sentinel stored in Lead.enrichmentError when rejestrio returns a
// 404 ('not_found' code). Lets the UI render a yellow "Not found" badge
// instead of a red error without needing a new enum value or schema change.
export const NOT_FOUND_ERROR_MARKER = '__not_found__';

export type ScoringCriterion = {
  key: string;
  label: string;
  description: string;
  maxScore: number;
  weight: number;
};

export type LeadListSummary = Pick<
  LeadList,
  | 'id'
  | 'publicId'
  | 'name'
  | 'rowCount'
  | 'createdAt'
  | 'updatedAt'
  | 'createdById'
> & {
  pendingCount: number;
  enrichedCount: number;
  // Hard failures only — leads where rejestrio returned 404 (company not
  // in KRS) are tracked separately in notFoundCount because they're a soft
  // warning, not an error.
  failedCount: number;
  notFoundCount: number;
};

export type LeadDto = {
  id: number;
  publicId: string;
  rowIndex: number;
  data: Record<string, unknown>;
  enrichmentStatus: LeadEnrichmentStatus;
  enrichedAt: Date | null;
  enrichmentError: string | null;
  scoringStatus: LeadScoringStatus;
  scoringError: string | null;
  scoredAt: Date | null;
};

export type LeadListDetail = {
  id: number;
  publicId: string;
  name: string;
  columns: LeadColumn[];
  rowCount: number;
  createdAt: Date;
  updatedAt: Date;
  scoringFileId: string | null;
  scoringFileName: string | null;
  scoringCriteria: ScoringCriterion[] | null;
  scoringDisqualifiers: string[] | null;
  scoringCriteriaError: string | null;
};

export type LeadListWithLeads = LeadListDetail & {
  leads: LeadDto[];
};

export type CsvImportResult = {
  columns: LeadColumn[];
  rows: Array<Record<string, unknown>>;
};

export type { Lead, LeadEnrichmentStatus, LeadScoringStatus };
