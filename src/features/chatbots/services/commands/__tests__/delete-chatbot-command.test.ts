import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDeleteMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: { deleteMany: (...args: unknown[]) => mockDeleteMany(...args) },
  },
}));

import { deleteChatbotCommand } from '../delete-chatbot-command';

describe('deleteChatbotCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes chatbot by id and organizationId', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteChatbotCommand('chatbot-1', 'org-1');

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'chatbot-1', organizationId: 'org-1' },
    });
    expect(result).toEqual({ count: 1 });
  });

  it('returns count 0 when chatbot does not exist or belongs to different org', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteChatbotCommand('chatbot-999', 'org-other');

    expect(result).toEqual({ count: 0 });
  });
});
