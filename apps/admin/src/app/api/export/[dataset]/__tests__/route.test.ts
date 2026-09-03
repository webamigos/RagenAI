import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminUser = vi.fn();
const recordAdminAction = vi.fn();
const auditFindMany = vi.fn();
const aiUsageFindMany = vi.fn();
const securityEventFindMany = vi.fn();
const orgFindMany = vi.fn();
const userFileGroupBy = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  getAdminUser: (...a: unknown[]) => getAdminUser(...a),
}));

vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...a: unknown[]) => recordAdminAction(...a),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
    aiUsage: { findMany: (...a: unknown[]) => aiUsageFindMany(...a) },
    securityEvent: {
      findMany: (...a: unknown[]) => securityEventFindMany(...a),
    },
    organization: { findMany: (...a: unknown[]) => orgFindMany(...a) },
    userFile: { groupBy: (...a: unknown[]) => userFileGroupBy(...a) },
  },
}));

const { GET } = await import('../route');

const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };

function request(url: string) {
  return new Request(url) as unknown as import('next/server').NextRequest & {
    nextUrl: URL;
  };
}

/** `NextRequest` exposes `nextUrl`; a plain Request does not. */
function nextRequest(url: string) {
  const req = request(url);
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminUser.mockResolvedValue(ADMIN);
  recordAdminAction.mockResolvedValue(undefined);
  auditFindMany.mockResolvedValue([]);
  aiUsageFindMany.mockResolvedValue([]);
  securityEventFindMany.mockResolvedValue([]);
  orgFindMany.mockResolvedValue([]);
  userFileGroupBy.mockResolvedValue([]);
});

describe('access', () => {
  /**
   * A GET route, so the dashboard layout's redirect never runs for it. Without
   * its own guard this would hand every audit row to anyone who guessed the URL.
   */
  it('refuses a caller who is not a platform administrator', async () => {
    getAdminUser.mockResolvedValue(null);

    const response = await GET(
      nextRequest('http://x/api/export/activity-log'),
      {
        params: Promise.resolve({ dataset: 'activity-log' }),
      },
    );

    expect(response.status).toBe(403);
    expect(auditFindMany).not.toHaveBeenCalled();
  });

  // The parameter selects which model is queried, so the allowlist is the
  // whole access-control story for it.
  it.each([
    ['an unknown dataset', 'users'],
    ['a path traversal attempt', '../users'],
    ['an empty dataset', ''],
  ])('404s for %s', async (_label, dataset) => {
    const response = await GET(nextRequest('http://x/api/export/x'), {
      params: Promise.resolve({ dataset }),
    });

    expect(response.status).toBe(404);
  });
});

describe('the response', () => {
  it('is a CSV attachment that must not be cached', async () => {
    const response = await GET(
      nextRequest('http://x/api/export/activity-log'),
      {
        params: Promise.resolve({ dataset: 'activity-log' }),
      },
    );

    expect(response.headers.get('content-type')).toBe(
      'text/csv; charset=utf-8',
    );
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="activity-log-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('writes the header row even when there are no rows', async () => {
    const response = await GET(
      nextRequest('http://x/api/export/activity-log'),
      {
        params: Promise.resolve({ dataset: 'activity-log' }),
      },
    );

    expect(await response.text()).toBe(
      'created_at,organization,user,action,entity_type,entity_id',
    );
  });

  it('renders a row in header order', async () => {
    auditFindMany.mockResolvedValue([
      {
        createdAt: new Date('2026-09-03T10:00:00.000Z'),
        organization: { name: 'Acme' },
        user: { email: 'a@b.c', name: 'A' },
        action: 'admin.user.banned',
        entityType: 'user',
        entityId: 'u-1',
      },
    ]);

    const body = await (
      await GET(nextRequest('http://x/api/export/activity-log'), {
        params: Promise.resolve({ dataset: 'activity-log' }),
      })
    ).text();

    expect(body.split('\n')[1]).toBe(
      '2026-09-03T10:00:00.000Z,Acme,a@b.c,admin.user.banned,user,u-1',
    );
  });

  // The whole reason the escaper is shared: a value shaped like a formula runs
  // in the spreadsheet of whoever opens the download.
  it('neutralises a value that would be a spreadsheet formula', async () => {
    auditFindMany.mockResolvedValue([
      {
        createdAt: new Date('2026-09-03T10:00:00.000Z'),
        organization: { name: '=HYPERLINK("http://evil","click")' },
        user: null,
        action: 'x',
        entityType: 'y',
        entityId: null,
      },
    ]);

    const body = await (
      await GET(nextRequest('http://x/api/export/activity-log'), {
        params: Promise.resolve({ dataset: 'activity-log' }),
      })
    ).text();

    expect(body).toContain("'=HYPERLINK");
    expect(body).not.toMatch(/,=HYPERLINK/);
  });
});

describe('filters', () => {
  it('honours the same window the page is showing', async () => {
    await GET(nextRequest('http://x/api/export/activity-log?days=7'), {
      params: Promise.resolve({ dataset: 'activity-log' }),
    });

    const where = auditFindMany.mock.calls[0][0].where;
    const days =
      (Date.now() - where.createdAt.gte.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(7);
  });

  it.each([
    ['a missing value', ''],
    ['a non-numeric value', '?days=abc'],
    ['zero', '?days=0'],
    ['a negative value', '?days=-5'],
  ])('falls back to 30 days for %s', async (_label, query) => {
    await GET(nextRequest(`http://x/api/export/activity-log${query}`), {
      params: Promise.resolve({ dataset: 'activity-log' }),
    });

    const where = auditFindMany.mock.calls[0][0].where;
    const days =
      (Date.now() - where.createdAt.gte.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(30);
  });

  // Unbounded, this is a way to pull the entire history in one request.
  it('caps the window at a year', async () => {
    await GET(nextRequest('http://x/api/export/activity-log?days=99999'), {
      params: Promise.resolve({ dataset: 'activity-log' }),
    });

    const where = auditFindMany.mock.calls[0][0].where;
    const days =
      (Date.now() - where.createdAt.gte.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(365);
  });

  it('scopes to one organization when asked', async () => {
    await GET(nextRequest('http://x/api/export/activity-log?orgId=org-1'), {
      params: Promise.resolve({ dataset: 'activity-log' }),
    });

    expect(auditFindMany.mock.calls[0][0].where.organizationId).toBe('org-1');
  });

  it('bounds the row count', async () => {
    await GET(nextRequest('http://x/api/export/activity-log'), {
      params: Promise.resolve({ dataset: 'activity-log' }),
    });

    expect(auditFindMany.mock.calls[0][0].take).toBe(10_000);
  });
});

describe('incidents', () => {
  /**
   * `metadata` is the one column that can hold an arbitrary event payload —
   * request bodies, tool arguments, flagged content. A CSV is the easiest way
   * for it to leave the building, so it is not a column here.
   */
  it('does not export the event metadata', async () => {
    securityEventFindMany.mockResolvedValue([
      {
        createdAt: new Date('2026-09-03T10:00:00.000Z'),
        publicId: 'evt-1',
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'info',
        source: 'auth',
        organization: null,
        user: null,
        ipAddress: '1.2.3.4',
        resolvedAt: null,
        resolvedBy: null,
        metadata: { secretPayload: 'should not appear' },
      },
    ]);

    const body = await (
      await GET(nextRequest('http://x/api/export/incidents'), {
        params: Promise.resolve({ dataset: 'incidents' }),
      })
    ).text();

    expect(body).not.toContain('secretPayload');
    expect(body).not.toContain('should not appear');
    expect(body.split('\n')[0]).not.toContain('metadata');
  });
});

describe('the export is itself recorded', () => {
  it('audits what was taken and how much of it', async () => {
    auditFindMany.mockResolvedValue([
      {
        createdAt: new Date(),
        organization: null,
        user: null,
        action: 'a',
        entityType: 'b',
        entityId: null,
      },
    ]);

    await GET(nextRequest('http://x/api/export/activity-log?days=7'), {
      params: Promise.resolve({ dataset: 'activity-log' }),
    });

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        action: 'admin.export.downloaded',
        entityType: 'export',
        entityId: 'activity-log',
        after: expect.objectContaining({ dataset: 'activity-log', rows: 1 }),
      }),
    );
  });

  it('records nothing when the caller was refused', async () => {
    getAdminUser.mockResolvedValue(null);

    await GET(nextRequest('http://x/api/export/activity-log'), {
      params: Promise.resolve({ dataset: 'activity-log' }),
    });

    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});
