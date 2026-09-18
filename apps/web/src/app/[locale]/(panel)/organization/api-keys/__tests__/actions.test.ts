import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetOrgId = vi.fn();
const mockGetUserId = vi.fn();
const mockRequireOrgAdmin = vi.fn();
const mockCreateCommand = vi.fn();
const mockProjectFindFirst = vi.fn();
const mockAssistantsQuery = vi.fn();

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
  '@/features/projects/services/queries/get-org-assistants-query',
  () => ({
    getOrgAssistantsQuery: (...args: unknown[]) => mockAssistantsQuery(...args),
  }),
);

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

import { createApiKey, getAssistantsForKeyScope } from '../actions';

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

// Fills the scope picker, so it answers "which assistants may this admin bind
// a key to" — a question about the caller's org, not about the form's input.
describe('getAssistantsForKeyScope action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgId.mockResolvedValue('org-1');
    mockRequireOrgAdmin.mockResolvedValue(undefined);
    mockAssistantsQuery.mockResolvedValue([{ id: 'proj-1', title: 'Support' }]);
  });

  it('asks only for the caller org assistants', async () => {
    await expect(getAssistantsForKeyScope()).resolves.toEqual([
      { id: 'proj-1', title: 'Support' },
    ]);
    expect(mockAssistantsQuery).toHaveBeenCalledWith('org-1');
  });

  it('requires an org admin', async () => {
    mockRequireOrgAdmin.mockRejectedValue(new Error('forbidden'));

    await expect(getAssistantsForKeyScope()).rejects.toThrow('forbidden');
    expect(mockAssistantsQuery).not.toHaveBeenCalled();
  });
});
