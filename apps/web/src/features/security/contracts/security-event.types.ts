import type {
  SecurityEventSeverity,
  SecurityEventType,
} from '@/generated/prisma/client';

export { SecurityEventSeverity, SecurityEventType };

/**
 * Source buckets used when recording an event. Kept as a string union rather
 * than a Prisma enum so producers can drop in new sources without a migration.
 */
export type SecurityEventSource =
  'auth' | 'chat' | 'chatbot' | 'upload' | 'admin' | 'api' | 'mcp' | 'infra';

export type RecordSecurityEventInput = {
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  source: SecurityEventSource;
  organizationId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

export type SecurityEventFilters = {
  organizationId?: string | null; // null = unscoped (app-admin view only)
  userId?: string;
  eventType?: SecurityEventType;
  severity?: SecurityEventSeverity;
  resolved?: boolean;
  period?: '1d' | '7d' | '30d' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type SecurityEventRow = {
  id: number;
  publicId: string;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  source: string;
  organizationId: string | null;
  organizationName: string | null;
  userId: string | null;
  user: { id: string; name: string | null; email: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: unknown;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
};

export type SecurityEventPaginatedResult = {
  items: SecurityEventRow[];
  totalCount: number;
  totalPages: number;
  page: number;
};
