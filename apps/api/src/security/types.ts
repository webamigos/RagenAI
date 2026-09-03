import type {
  SecurityEventSeverity,
  SecurityEventType,
} from '../generated/prisma/client.js';

export type { SecurityEventSeverity, SecurityEventType };

/**
 * Ported from apps/web's
 * src/features/security/contracts/security-event.types.ts — only the
 * write-path types this slice needs (RecordSecurityEventInput,
 * SecurityEventSource). The dashboard/reporting types in the original
 * (SecurityEventFilters, SecurityEventRow, ...) are not needed here. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
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

/**
 * Callback shape accepted by mcp/connectors code that wants to record a
 * security event without depending on NestJS DI directly (they're plain,
 * framework-agnostic functions). A real caller passes
 * `securityEventService.record.bind(securityEventService)`.
 */
export type RecordSecurityEvent = (input: RecordSecurityEventInput) => void;
