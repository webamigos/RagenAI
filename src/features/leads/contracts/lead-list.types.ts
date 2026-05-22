import type {
  LeadList,
  Lead,
  LeadEnrichmentStatus,
} from '@/generated/prisma/client';
import type { LeadColumn } from './lead-column.types';

// Stable sentinel stored in Lead.enrichmentError when rejestrio returns a
// 404 ('not_found' code). Lets the UI render a yellow "Not found" badge
// instead of a red error without needing a new enum value or schema change.
export const NOT_FOUND_ERROR_MARKER = '__not_found__';

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
  failedCount: number;
};

export type LeadDto = {
  id: number;
  publicId: string;
  rowIndex: number;
  data: Record<string, unknown>;
  enrichmentStatus: LeadEnrichmentStatus;
  enrichedAt: Date | null;
  enrichmentError: string | null;
};

export type LeadListDetail = {
  id: number;
  publicId: string;
  name: string;
  columns: LeadColumn[];
  rowCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type LeadListWithLeads = LeadListDetail & {
  leads: LeadDto[];
};

export type CsvImportResult = {
  columns: LeadColumn[];
  rows: Array<Record<string, unknown>>;
};

export type { Lead, LeadEnrichmentStatus };
