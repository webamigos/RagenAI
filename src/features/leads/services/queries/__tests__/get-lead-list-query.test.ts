import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    leadList: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    lead: { findMany: (...a: unknown[]) => mockFindMany(...a) },
  },
}));

import {
  getLeadListWithLeadsQuery,
  MAX_LEADS_PAGE_SIZE,
  DEFAULT_LEADS_PAGE_SIZE,
} from '../get-lead-list-query';

const baseList = {
  id: 1,
  publicId: 'list-uuid',
  name: 'Test List',
  columns: [],
  rowCount: 250,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(baseList);
  mockFindMany.mockResolvedValue([]);
});

describe('getLeadListWithLeadsQuery — pagination clamping', () => {
  it('clamps requested page to totalPages when page exceeds range', async () => {
    // rowCount=250, pageSize=100 → totalPages=3; requesting page=99 should clamp to 3
    const result = await getLeadListWithLeadsQuery('list-uuid', 'org-1', {
      page: 99,
      pageSize: 100,
    });
    expect(result).not.toBeNull();
    expect(result!.page).toBe(3);
    expect(result!.totalPages).toBe(3);
    const skipArg = mockFindMany.mock.calls[0][0].skip;
    expect(skipArg).toBe(200); // (3-1) * 100
  });

  it('returns page 1 when page 0 or negative is requested', async () => {
    const result = await getLeadListWithLeadsQuery('list-uuid', 'org-1', {
      page: 0,
      pageSize: 100,
    });
    expect(result!.page).toBe(1);
    expect(mockFindMany.mock.calls[0][0].skip).toBe(0);
  });

  it('uses DEFAULT_LEADS_PAGE_SIZE when pageSize is omitted', async () => {
    const result = await getLeadListWithLeadsQuery('list-uuid', 'org-1');
    expect(result!.pageSize).toBe(DEFAULT_LEADS_PAGE_SIZE);
  });

  it('caps pageSize to MAX_LEADS_PAGE_SIZE', async () => {
    const result = await getLeadListWithLeadsQuery('list-uuid', 'org-1', {
      pageSize: MAX_LEADS_PAGE_SIZE + 1000,
    });
    expect(result!.pageSize).toBe(MAX_LEADS_PAGE_SIZE);
  });

  it('returns null when list is not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await getLeadListWithLeadsQuery('missing', 'org-1');
    expect(result).toBeNull();
  });

  it('totalPages is at least 1 for empty list', async () => {
    mockFindFirst.mockResolvedValue({ ...baseList, rowCount: 0 });
    const result = await getLeadListWithLeadsQuery('list-uuid', 'org-1');
    expect(result!.totalPages).toBe(1);
    expect(result!.page).toBe(1);
  });
});
