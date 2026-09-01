import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockCount = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    securityEvent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

import { listSecurityEventsQuery } from '../services/queries/list-security-events-query';

describe('listSecurityEventsQuery — org scoping contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('unscoped (organizationId undefined) queries without an organizationId filter — app-admin view', async () => {
    await listSecurityEventsQuery({});

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.organizationId).toBeUndefined();
  });

  it('org-scoped (organizationId string) restricts to that org exactly', async () => {
    await listSecurityEventsQuery({ organizationId: 'org-1' });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.organizationId).toBe('org-1');
  });

  it('organizationId=null returns only null-org (pre-auth) events', async () => {
    await listSecurityEventsQuery({ organizationId: null });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.organizationId).toBeNull();
  });

  it('applies eventType, severity, and resolved filters when provided', async () => {
    await listSecurityEventsQuery({
      organizationId: 'org-1',
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'critical',
      resolved: false,
    });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.eventType).toBe('AUTH_LOGIN_FAILED');
    expect(whereArg.severity).toBe('critical');
    expect(whereArg.resolvedAt).toBeNull();
  });

  it('resolved=true filters for acknowledged events', async () => {
    await listSecurityEventsQuery({ resolved: true });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.resolvedAt).toEqual({ not: null });
  });

  it('orders by severity desc then createdAt desc (critical first)', async () => {
    await listSecurityEventsQuery({});

    const orderByArg = mockFindMany.mock.calls[0][0].orderBy;
    expect(orderByArg).toEqual([{ severity: 'desc' }, { createdAt: 'desc' }]);
  });

  it('applies pagination with default page size 25', async () => {
    await listSecurityEventsQuery({ page: 2 });

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.take).toBe(25);
    expect(callArgs.skip).toBe(25);
  });

  it('caps pageSize at 100 to prevent huge queries', async () => {
    await listSecurityEventsQuery({ pageSize: 10_000 });

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.take).toBe(100);
  });

  it('returns totalPages based on count', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(53);

    const result = await listSecurityEventsQuery({ pageSize: 10 });

    expect(result.totalPages).toBe(6);
    expect(result.totalCount).toBe(53);
  });

  it('maps Prisma rows to SecurityEventRow DTO shape', async () => {
    const createdAt = new Date('2026-04-11T12:00:00Z');
    mockFindMany.mockResolvedValue([
      {
        id: 1,
        publicId: 'pub-1',
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'critical',
        source: 'auth',
        organizationId: 'org-1',
        userId: 'user-1',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla',
        requestId: 'req-1',
        metadata: { attempts: 12 },
        resolvedAt: null,
        resolvedBy: null,
        createdAt,
        organization: { name: 'Acme' },
        user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
      },
    ]);
    mockCount.mockResolvedValue(1);

    const result = await listSecurityEventsQuery({ organizationId: 'org-1' });

    expect(result.items).toHaveLength(1);
    const row = result.items[0];
    expect(row.publicId).toBe('pub-1');
    expect(row.organizationName).toBe('Acme');
    expect(row.user?.email).toBe('alice@example.com');
    expect(row.createdAt).toBe(createdAt.toISOString());
  });
});
