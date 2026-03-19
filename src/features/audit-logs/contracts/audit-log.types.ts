export type AuditLogListItem = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
  organizationName: string;
  organizationId: string;
  user: { id: string; name: string | null; email: string } | null;
};

export type AuditLogFilters = {
  period?: '1d' | '7d' | '30d' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  organizationId?: string;
  userId?: string;
  entityType?: string;
  action?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogPaginatedResult = {
  items: AuditLogListItem[];
  totalCount: number;
  totalPages: number;
  page: number;
};

export type AuditLogFilterOptions = {
  entityTypes: string[];
  actions: string[];
  users: { id: string; name: string | null; email: string }[];
  organizations: { id: string; name: string }[];
};
