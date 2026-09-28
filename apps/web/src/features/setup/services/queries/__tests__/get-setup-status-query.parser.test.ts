import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@ragenai/prisma-client', () => ({
  default: { user: { findFirst: vi.fn(async () => ({ id: 'admin-1' })) } },
}));
vi.mock('../../install-claim', () => ({
  backfillClaimIfAdminExists: vi.fn(async () => undefined),
  isInstallClaimed: vi.fn(async () => true),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const getParserStatusQuery = vi.hoisted(() => vi.fn());
vi.mock('@/features/parsing/services/queries/get-parser-status-query', () => ({
  getParserStatusQuery,
}));

import { getSetupStatusQuery } from '../get-setup-status-query';

const ids = (status: Awaited<ReturnType<typeof getSetupStatusQuery>>) =>
  status.report.findings.map((f) => f.id);

beforeEach(() => getParserStatusQuery.mockReset());

describe('getSetupStatusQuery — Docling (spec C1, D5)', () => {
  it('reports a parser outage as a recommended finding, with since when', async () => {
    getParserStatusQuery.mockResolvedValue({
      state: 'down',
      since: '2026-09-28T07:15:00.000Z',
    });
    const status = await getSetupStatusQuery();
    expect(
      status.report.findings.find((f) => f.id === 'docling-unavailable'),
    ).toMatchObject({
      severity: 'recommended',
      values: { since: Date.parse('2026-09-28T07:15:00.000Z') },
    });
  });

  it.each([
    ['up', { state: 'up' }],
    ['unknown', { state: 'unknown' }],
  ])('adds nothing when the parser is %s', async (_, parser) => {
    getParserStatusQuery.mockResolvedValue(parser);
    expect(ids(await getSetupStatusQuery())).not.toContain(
      'docling-unavailable',
    );
  });
});
