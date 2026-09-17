import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetOrgId = vi.fn();
const mockGetUserId = vi.fn();
const mockRequireOrgAdmin = vi.fn();
const mockCreateCommand = vi.fn();
const mockProjectFindFirst = vi.fn();

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: (...args: unknown[]) => mockGetOrgId(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetUserId(...args),
}));

vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdmin: (...args: unknown[]) => mockRequireOrgAdmin(...args),
}));

vi.mock(
  '@/features/organizations/services/commands/create-api-key-command',
  () => ({
    createApiKeyCommand: (...args: unknown[]) => mockCreateCommand(...args),
  }),
);

vi.mock('@/features/organizations/services/queries/get-api-keys-query', () => ({
  getApiKeysQuery: vi.fn(),
}));

vi.mock(
  '@/features/organizations/services/commands/remove-api-key-command',
  () => ({ removeApiKeyCommand: vi.fn() }),
);

vi.mock(
  '@/features/organizations/services/commands/toggle-api-key-command',
  () => ({ toggleApiKeyCommand: vi.fn() }),
);

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    apiKey: { update: vi.fn() },
  },
}));

import { createApiKey } from '../actions';

describe('createApiKey action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgId.mockResolvedValue('org-1');
    mockGetUserId.mockResolvedValue('user-1');
    mockRequireOrgAdmin.mockResolvedValue(undefined);
    mockCreateCommand.mockResolvedValue({ id: 'key-1' });
  });

  it('passes the scope and assistant through to the command', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'proj-1' });

    await createApiKey({
      name: 'n8n',
      knowledgeScope: 'ASSISTANT',
      projectId: 'proj-1',
    });

    expect(mockCreateCommand).toHaveBeenCalledWith({
      orgId: 'org-1',
      userId: 'user-1',
      name: 'n8n',
      knowledgeScope: 'ASSISTANT',
      projectId: 'proj-1',
    });
  });

  // The scope on an issued key is a permission boundary, so the id the client
  // sends has to be a project this org can actually see — checked here, where
  // the session is, rather than trusted from the form.
  it('refuses an assistant from another organization', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    await expect(
      createApiKey({
        name: 'n8n',
        knowledgeScope: 'ASSISTANT',
        projectId: 'someone-elses-project',
      }),
    ).rejects.toThrow(/Unknown assistant/);

    expect(mockProjectFindFirst).toHaveBeenCalledWith({
      where: { id: 'someone-elses-project', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(mockCreateCommand).not.toHaveBeenCalled();
  });

  it('does not query for a project when none was named', async () => {
    await createApiKey({ name: 'kb key' });

    expect(mockProjectFindFirst).not.toHaveBeenCalled();
    expect(mockCreateCommand).toHaveBeenCalledWith({
      orgId: 'org-1',
      userId: 'user-1',
      name: 'kb key',
    });
  });

  it('requires an org admin before anything else', async () => {
    mockRequireOrgAdmin.mockRejectedValue(new Error('forbidden'));

    await expect(createApiKey({ name: 'n8n' })).rejects.toThrow('forbidden');
    expect(mockCreateCommand).not.toHaveBeenCalled();
  });

  it('refuses when the session has no user', async () => {
    mockGetUserId.mockResolvedValue(null);

    await expect(createApiKey({ name: 'n8n' })).rejects.toThrow(
      /User session not found/,
    );
    expect(mockCreateCommand).not.toHaveBeenCalled();
  });
});
