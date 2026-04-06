import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    assistantTemplate: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    project: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({
    trackAudit: vi.fn(),
  }),
);

import { activateTemplateCommand } from '../services/commands/activate-template-command';

describe('activateTemplateCommand', () => {
  const orgId = 'org-123';
  const userId = 'user-456';
  const templatePublicId = 'tpl-pub-789';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when template not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      activateTemplateCommand(templatePublicId, orgId, userId),
    ).rejects.toThrow('Template not found');
  });

  it('returns existing project when template+org combo already exists', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'tpl-1',
      name: 'HR Assistant',
    });
    mockFindFirst.mockResolvedValue({ id: 'existing-project-id' });

    const result = await activateTemplateCommand(
      templatePublicId,
      orgId,
      userId,
    );

    expect(result).toEqual({ projectId: 'existing-project-id' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates new project when no existing one', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'tpl-1',
      name: 'HR Assistant',
    });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'new-project-id' });

    const result = await activateTemplateCommand(
      templatePublicId,
      orgId,
      userId,
    );

    expect(result).toEqual({ projectId: 'new-project-id' });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        title: 'HR Assistant',
        organizationId: orgId,
        ownerId: userId,
        templateId: 'tpl-1',
      },
    });
  });
});
