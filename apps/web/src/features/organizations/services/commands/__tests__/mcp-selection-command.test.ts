import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  assertContext: vi.fn(),
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpConnectSelection: { upsert: mocks.upsert, findUnique: mocks.findUnique },
  },
}));
vi.mock('../../queries/mcp-grant-context-query', () => ({
  assertMcpGrantContext: mocks.assertContext,
}));
import {
  saveMcpSelection,
  getMcpSelection,
  mcpClaims,
  mcpReferenceId,
} from '../mcp-selection-command';
const actor = { sessionId: 'session-a', userId: 'user-a' };
describe('MCP grant binding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.assertContext.mockResolvedValue({});
  });
  it('isolates two clients in the same session', async () => {
    await saveMcpSelection(actor, 'client-a', 'org-a', 'project-a');
    await saveMcpSelection(actor, 'client-b', 'org-b');
    expect(mocks.upsert.mock.calls.map((call) => call[0].where)).toEqual([
      { sessionId_clientId: { sessionId: 'session-a', clientId: 'client-a' } },
      { sessionId_clientId: { sessionId: 'session-a', clientId: 'client-b' } },
    ]);
    expect(mocks.upsert.mock.calls[1][0].update.projectId).toBeNull();
  });
  it('does not write a selection without live permission', async () => {
    mocks.assertContext.mockRejectedValue(new Error('Denied'));
    await expect(saveMcpSelection(actor, 'client-a', 'org-a')).rejects.toThrow(
      'Denied',
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { userId: 'other', createdAt: new Date() },
    { userId: 'user-a', createdAt: new Date(Date.now() - 601000) },
  ])('refuses absent, foreign or stale selection %j', async (selection) => {
    mocks.findUnique.mockResolvedValue(selection);
    await expect(getMcpSelection(actor, 'client-a')).rejects.toThrow(
      'Choose an organization again',
    );
    expect(mocks.assertContext).not.toHaveBeenCalled();
  });
  it('revalidates a selected assistant', async () => {
    const selection = {
      userId: 'user-a',
      organizationId: 'org-a',
      projectId: 'project-a',
      createdAt: new Date(),
    };
    mocks.findUnique.mockResolvedValue(selection);
    expect(await getMcpSelection(actor, 'client-a')).toBe(selection);
    expect(mocks.assertContext).toHaveBeenCalledWith(
      'user-a',
      'org-a',
      'project-a',
    );
  });
  it.each([undefined, '', 'org', 'org:', ':all', 'org:all:extra'])(
    'rejects malformed consent reference %s',
    async (reference) => {
      await expect(mcpClaims('user-a', reference)).rejects.toThrow(
        'workspace selection',
      );
    },
  );
  it('requires a user and validates live permissions when minting', async () => {
    await expect(mcpClaims(undefined, 'org-a:all')).rejects.toThrow();
    expect(
      await mcpClaims('user-a', mcpReferenceId('org-a', 'project-a')),
    ).toEqual({ org: 'org-a', project: 'project-a' });
    expect(mocks.assertContext).toHaveBeenCalledWith(
      'user-a',
      'org-a',
      'project-a',
    );
    expect(await mcpClaims('user-a', mcpReferenceId('org-a'))).toEqual({
      org: 'org-a',
    });
    mocks.assertContext.mockRejectedValue(new Error('Removed'));
    await expect(mcpClaims('user-a', 'org-a:all')).rejects.toThrow('Removed');
  });
});
