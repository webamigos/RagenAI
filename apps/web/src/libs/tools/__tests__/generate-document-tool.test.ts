import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetToken = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ accessToken: 'mock-drive-token' }),
);
const mockJobStart = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockNanoid = vi.hoisted(() => vi.fn().mockReturnValue('abc123'));

vi.mock('@/libs/ragen-vault/client', () => ({
  ragenAuthClient: { getToken: mockGetToken },
}));

vi.mock('@/libs/jobs', () => ({
  jobs: () => ({ start: mockJobStart }),
}));

vi.mock('nanoid', () => ({ nanoid: mockNanoid }));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/features/documents/contracts/document.types', () => ({
  Workflow: { GENERATE_DOCUMENT: 'generateDocument' },
}));

import { createGenerateDocumentTool } from '../generate-document-tool';

const ctx = {
  orgId: 'org-1',
  userId: 'user-1',
  userEmail: 'test@example.com',
};

describe('createGenerateDocumentTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a tool with execute and parameters', () => {
    const tool = createGenerateDocumentTool(ctx);
    expect(tool).toHaveProperty('execute');
    expect(tool).toHaveProperty('parameters');
  });

  it('starts Temporal workflow with correct args on execute', async () => {
    const tool = createGenerateDocumentTool(ctx);

    const result = await tool.execute({
      templateName: 'workshop-summary' as const,
      rawInput: 'Some workshop notes',
      clientName: 'Acme Corp',
      driveFolderId: 'folder-123',
    });

    expect(mockGetToken).toHaveBeenCalledWith(
      'org-1:user-1:google_drive',
      'GOOGLE_DRIVE',
    );

    expect(mockJobStart).toHaveBeenCalledWith(
      'generateDocument',
      'docgen-org-1-abc123',
      {
        templateName: 'workshop-summary',
        rawInput: { content: 'Some workshop notes' },
        clientName: 'Acme Corp',
        driveFolderId: 'folder-123',
        driveAccessToken: 'mock-drive-token',
        orgId: 'org-1',
        userId: 'user-1',
        userEmail: 'test@example.com',
      },
    );

    expect(result).toEqual({
      success: true,
      workflowId: 'docgen-org-1-abc123',
      message: expect.stringContaining('Document generation has been started'),
    } as typeof result);
  });

  it('returns error when Google Drive token is unavailable', async () => {
    mockGetToken.mockRejectedValueOnce(new Error('Token not found'));

    const tool = createGenerateDocumentTool(ctx);
    const result = await tool.execute({
      templateName: 'workshop-summary' as const,
      rawInput: 'Notes',
      clientName: 'Test',
      driveFolderId: 'folder-1',
    });

    expect(result).toEqual({
      success: false,
      workflowId: null,
      message: expect.stringContaining('Google Drive is not connected'),
    });
    expect(mockJobStart).not.toHaveBeenCalled();
  });

  it('returns error when the job fails to start', async () => {
    mockJobStart.mockRejectedValueOnce(new Error('Temporal down'));

    const tool = createGenerateDocumentTool(ctx);
    const result = await tool.execute({
      templateName: 'workshop-summary' as const,
      rawInput: 'Notes',
      clientName: 'Test',
      driveFolderId: 'folder-1',
    });

    expect(result).toEqual({
      success: false,
      workflowId: null,
      message: expect.stringContaining('Failed to start document generation'),
    });
  });
});
