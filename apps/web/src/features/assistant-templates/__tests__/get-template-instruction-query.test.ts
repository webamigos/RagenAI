import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProjectFindUnique = vi.fn();
const mockTemplateFindUnique = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    assistantTemplate: {
      findUnique: (...args: unknown[]) => mockTemplateFindUnique(...args),
    },
  },
}));

import { getTemplateInstructionForProject } from '../services/queries/get-template-instruction-query';

describe('getTemplateInstructionForProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when project has no templateId', async () => {
    mockProjectFindUnique.mockResolvedValue({ templateId: null });

    const result = await getTemplateInstructionForProject('project-1');

    expect(result).toBeNull();
    expect(mockTemplateFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when project not found', async () => {
    mockProjectFindUnique.mockResolvedValue(null);

    const result = await getTemplateInstructionForProject('project-999');

    expect(result).toBeNull();
  });

  it('returns instructions for active template', async () => {
    mockProjectFindUnique.mockResolvedValue({ templateId: 'tpl-5' });
    mockTemplateFindUnique.mockResolvedValue({
      instructions: 'You are an HR assistant.',
    });

    const result = await getTemplateInstructionForProject('project-1');

    expect(result).toBe('You are an HR assistant.');
    expect(mockTemplateFindUnique).toHaveBeenCalledWith({
      where: { id: 'tpl-5', isActive: true },
      select: { instructions: true },
    });
  });

  it('returns null when template is inactive', async () => {
    mockProjectFindUnique.mockResolvedValue({ templateId: 'tpl-5' });
    mockTemplateFindUnique.mockResolvedValue(null);

    const result = await getTemplateInstructionForProject('project-1');

    expect(result).toBeNull();
  });
});
