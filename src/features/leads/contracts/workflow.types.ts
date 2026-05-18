// Temporal workflow names for leads enrichment. The worker-side
// implementation lives in the ragen-worker repo and is referenced
// by string name, not import (Temporal workflow definition limitation).
export enum LeadsWorkflow {
  BULK_ENRICH_LEAD_LIST = 'bulkEnrichLeadList',
}

export type BulkEnrichLeadListPayload = {
  jobPublicId: string;
  leadListPublicId: string;
  organizationId: string;
  userId: string;
  // Lead public IDs to process, in row order. Capped by the action.
  leadPublicIds: string[];
};
