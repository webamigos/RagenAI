export type TrackAuditInput = {
  orgId: string;
  userId?: string | null;
  impersonatedBy?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
};
