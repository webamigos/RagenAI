import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

import { getOrgAssistantsQuery } from '../get-org-assistants-query';

describe('getOrgAssistantsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ id: 'proj-1', title: 'Support bot' }]);
  });

  // This feeds the API-key scope picker, and the id it returns becomes a
  // permission boundary on an issued key — so the org clause is the whole
  // point of the query, not a detail of it.
  it('scopes to the organization and excludes archived assistants', async () => {
    await getOrgAssistantsQuery('org-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', isArchived: false },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  // Not `getUserProjectsQuery`: that one loads every thread and message in
  // each project, which is a lot of decrypted content for a dropdown.
  it('selects only what a picker needs', async () => {
    await expect(getOrgAssistantsQuery('org-1')).resolves.toEqual([
      { id: 'proj-1', title: 'Support bot' },
    ]);
    expect(mockFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      title: true,
    });
  });
});
