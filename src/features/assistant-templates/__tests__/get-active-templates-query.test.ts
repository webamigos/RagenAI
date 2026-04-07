import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    assistantTemplate: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { getActiveTemplatesQuery } from '../services/queries/get-active-templates-query';

describe('getActiveTemplatesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries only active templates ordered by sortOrder', async () => {
    mockFindMany.mockResolvedValue([]);

    await getActiveTemplatesQuery();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        iconUrl: true,
      },
      orderBy: { sortOrder: 'asc' },
    });
  });

  it('does not include instructions in the select', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'tpl-1',
        name: 'HR',
        description: 'HR assistant',
        iconUrl: null,
      },
    ]);

    const result = await getActiveTemplatesQuery();

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('instructions');

    // Verify the select does not include 'instructions'
    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.select).not.toHaveProperty('instructions');
  });
});
