import { type NextRequest, NextResponse } from 'next/server';
import {
  buildCsvString,
  csvDownloadHeaders,
} from '@ragenai/platform-contracts';

// Same relative reach as `lib/audit.ts`, from one directory deeper: the
// client is generated into apps/web.
import type { McpConnectorProvider } from '../../../../../../web/src/generated/prisma/client';

import { getAdminUser } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * CSV export for the panel's read-only pages.
 *
 * One route rather than four, because the shape is identical every time: read
 * the same filters the page reads, run the same query, serialise. A dataset
 * that is not in the map below is a 404 — the parameter reaches Prisma model
 * selection, so an allowlist is the whole access-control story here.
 *
 * Guarded like a Server Action rather than like a page: this is a GET endpoint
 * anyone can call directly, and the dashboard layout does not run for it.
 *
 * Formula neutralisation and RFC 4180 quoting come from
 * `@ragenai/platform-contracts` — see the note there about the copy that had
 * only half of it.
 */

const MAX_ROWS = 10_000;

const CONNECTOR_STATUSES = ['CONNECTED', 'PENDING', 'ERROR'] as const;

const SEVERITIES = ['info', 'warn', 'critical'] as const;
type Severity = (typeof SEVERITIES)[number];

/** Anything else is ignored rather than passed to Prisma, which would 500. */
function parseSeverity(value: string | null): Severity | undefined {
  return SEVERITIES.includes(value as Severity)
    ? (value as Severity)
    : undefined;
}

function parseDays(value: string | null): number {
  const days = Number(value);
  return Number.isFinite(days) && days >= 1 ? Math.min(days, 365) : 30;
}

function since(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

type Dataset = {
  headers: string[];
  /** Rows in header order. Anything nullable renders as an empty cell. */
  load: (request: NextRequest) => Promise<Record<string, unknown>[]>;
};

const DATASETS: Record<string, Dataset> = {
  'activity-log': {
    headers: [
      'created_at',
      'organization',
      'user',
      'action',
      'entity_type',
      'entity_id',
    ],
    load: async (request) => {
      const params = request.nextUrl.searchParams;
      const rows = await prisma.auditLog.findMany({
        where: {
          createdAt: { gte: since(parseDays(params.get('days'))) },
          ...(params.get('action') ? { action: params.get('action')! } : {}),
          ...(params.get('entityType')
            ? { entityType: params.get('entityType')! }
            : {}),
          ...(params.get('orgId')
            ? { organizationId: params.get('orgId')! }
            : {}),
        },
        include: {
          organization: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });

      return rows.map((row) => ({
        created_at: row.createdAt.toISOString(),
        organization: row.organization?.name ?? '',
        user: row.user?.email ?? row.user?.name ?? '',
        action: row.action,
        entity_type: row.entityType,
        entity_id: row.entityId ?? '',
      }));
    },
  },

  'ai-usage': {
    headers: [
      'created_at',
      'organization',
      'user',
      'provider',
      'model',
      'input_tokens',
      'output_tokens',
      'total_tokens',
      'estimated_cost',
    ],
    load: async (request) => {
      const params = request.nextUrl.searchParams;
      const rows = await prisma.aiUsage.findMany({
        where: {
          createdAt: { gte: since(parseDays(params.get('days'))) },
          ...(params.get('orgId')
            ? { organizationId: params.get('orgId')! }
            : {}),
        },
        include: {
          organization: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });

      return rows.map((row) => ({
        created_at: row.createdAt.toISOString(),
        organization: row.organization?.name ?? '',
        user: row.user?.email ?? row.user?.name ?? '',
        provider: row.provider ?? '',
        model: row.model ?? '',
        input_tokens: row.inputTokens ?? 0,
        output_tokens: row.outputTokens ?? 0,
        total_tokens: row.totalTokens ?? 0,
        estimated_cost: row.estimatedCost ?? 0,
      }));
    },
  },

  incidents: {
    headers: [
      'created_at',
      'public_id',
      'event_type',
      'severity',
      'source',
      'organization',
      'user',
      'ip_address',
      'resolved_at',
      'resolved_by',
    ],
    load: async (request) => {
      const params = request.nextUrl.searchParams;
      const rows = await prisma.securityEvent.findMany({
        where: {
          createdAt: { gte: since(parseDays(params.get('days'))) },
          ...(params.get('orgId')
            ? { organizationId: params.get('orgId')! }
            : {}),
          ...(parseSeverity(params.get('severity'))
            ? { severity: parseSeverity(params.get('severity'))! }
            : {}),
          ...(params.get('eventType')
            ? { eventType: params.get('eventType') as never }
            : {}),
          // `resolved=true|false` on the page maps to whether resolvedAt is set.
          ...(params.get('resolved') === 'true'
            ? { resolvedAt: { not: null } }
            : {}),
          ...(params.get('resolved') === 'false' ? { resolvedAt: null } : {}),
        },
        include: {
          organization: { select: { name: true } },
          user: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });

      // `metadata` is deliberately absent. It is the one column that can hold
      // arbitrary event payloads, and an export is the easiest way for it to
      // leave the building. The detail page shows it to one reader at a time.
      return rows.map((row) => ({
        created_at: row.createdAt.toISOString(),
        public_id: row.publicId,
        event_type: row.eventType,
        severity: row.severity,
        source: row.source,
        organization: row.organization?.name ?? '',
        user: row.user?.email ?? '',
        ip_address: row.ipAddress ?? '',
        resolved_at: row.resolvedAt?.toISOString() ?? '',
        resolved_by: row.resolvedBy ?? '',
      }));
    },
  },

  'disk-usage': {
    headers: [
      'organization',
      'file_count',
      'total_bytes',
      'page_count',
      'storage_limit_bytes',
      'project_count',
    ],
    load: async (request) => {
      const params = request.nextUrl.searchParams;
      // The page filters by organization and by name; without these the file
      // would not match the table the reader is looking at.
      const orgWhere = {
        ...(params.get('orgId') ? { id: params.get('orgId')! } : {}),
        ...(params.get('search')
          ? {
              name: {
                contains: params.get('search')!,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      };

      const orgs = await prisma.organization.findMany({
        where: orgWhere,
        select: {
          id: true,
          name: true,
          settings: { select: { storageLimitBytes: true } },
          _count: { select: { projects: true } },
        },
        orderBy: { name: 'asc' },
      });

      // Scoped to the organizations actually being exported. Unscoped this
      // aggregated every file on the platform to answer a one-organization
      // question — the output was right, the work was not.
      const sizes = await prisma.userFile.groupBy({
        by: ['organizationId'],
        where: { organizationId: { in: orgs.map((org) => org.id) } },
        _sum: { fileSize: true, pageCount: true },
        _count: true,
      });

      const byOrg = new Map(sizes.map((s) => [s.organizationId, s]));

      return orgs.map((org) => {
        const usage = byOrg.get(org.id);
        return {
          organization: org.name,
          file_count: usage?._count ?? 0,
          total_bytes: Number(usage?._sum.fileSize ?? 0),
          page_count: usage?._sum.pageCount ?? 0,
          storage_limit_bytes:
            org.settings?.storageLimitBytes == null
              ? ''
              : Number(org.settings.storageLimitBytes),
          project_count: org._count.projects,
        };
      });
    },
  },

  'api-keys': {
    // No masked value. `maskedValue` is in `SENSITIVE_FIELDS`, so the audit
    // trail redacts it; a CSV that carried it anyway would make the redaction
    // there pointless. The id identifies a key well enough to act on, and on
    // its own authenticates nothing — the guard still needs the vault secret.
    headers: [
      'id',
      'name',
      'organization',
      'project',
      'is_active',
      'debug_mode',
      'created_at',
      'created_by',
      'last_used_at',
    ],
    load: async (request) => {
      const params = request.nextUrl.searchParams;
      const status = params.get('status');

      const rows = await prisma.apiKey.findMany({
        where: {
          ...(params.get('orgId')
            ? { organizationId: params.get('orgId')! }
            : {}),
          ...(params.get('search')
            ? {
                name: {
                  contains: params.get('search')!,
                  mode: 'insensitive' as const,
                },
              }
            : {}),
          ...(status === 'active' ? { isActive: true } : {}),
          ...(status === 'inactive' ? { isActive: false } : {}),
          ...(status === 'never-used' ? { lastUsedAt: null } : {}),
          ...(status === 'debug' ? { debugMode: true } : {}),
        },
        include: {
          organization: { select: { name: true } },
          project: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });

      // `createdBy` is a user id with no declared relation, so resolve the
      // addresses in one read rather than per row.
      const creatorIds = [
        ...new Set(rows.map((row) => row.createdBy).filter(Boolean)),
      ] as string[];
      const creators = creatorIds.length
        ? await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
      const creatorMap = new Map(
        creators.map((user) => [user.id, user.email || user.name]),
      );

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        organization: row.organization?.name ?? '',
        project: row.project?.title ?? '',
        is_active: row.isActive,
        debug_mode: row.debugMode,
        created_at: row.createdAt.toISOString(),
        created_by: row.createdBy
          ? (creatorMap.get(row.createdBy) ?? row.createdBy)
          : '',
        last_used_at: row.lastUsedAt?.toISOString() ?? '',
      }));
    },
  },

  connectors: {
    headers: [
      'provider',
      'organization',
      'user',
      'status',
      'enabled',
      'connected_at',
      'last_error',
      'last_error_at',
      'created_at',
    ],
    load: async (request) => {
      const params = request.nextUrl.searchParams;

      const rows = await prisma.mcpConnector.findMany({
        where: {
          ...(params.get('orgId')
            ? { organizationId: params.get('orgId')! }
            : {}),
          ...(params.get('status')
            ? {
                status: params.get(
                  'status',
                )! as (typeof CONNECTOR_STATUSES)[number],
              }
            : {}),
          ...(params.get('provider')
            ? { provider: params.get('provider')! as McpConnectorProvider }
            : {}),
        },
        include: {
          organization: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: [
          { lastErrorAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        take: MAX_ROWS,
      });

      return rows.map((row) => ({
        provider: row.provider,
        organization: row.organization?.name ?? row.organizationId,
        user: row.user?.email ?? row.user?.name ?? row.userId,
        status: row.status,
        enabled: row.enabled,
        connected_at: row.connectedAt?.toISOString() ?? '',
        // The reason is free text from a remote server, so it goes through
        // the same formula neutralisation as every other cell.
        last_error: row.lastError ?? '',
        last_error_at: row.lastErrorAt?.toISOString() ?? '',
        created_at: row.createdAt.toISOString(),
      }));
    },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { dataset } = await params;
  const definition = DATASETS[dataset];
  if (!definition) {
    return NextResponse.json({ error: 'Unknown dataset' }, { status: 404 });
  }

  const rows = await definition.load(request);
  const body = buildCsvString(rows, definition.headers);

  // Exporting is itself an administrative action worth recording: it is how a
  // large amount of customer data leaves the system in one click.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.dataExported,
    entityType: 'export',
    entityId: dataset,
    after: { dataset, rows: rows.length, query: request.nextUrl.search },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: csvDownloadHeaders(`${dataset}-${stamp}`),
  });
}
