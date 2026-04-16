import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockDelete = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    message: {
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { regenerateAssistantMessageCommand } from '../regenerate-assistant-message-command';

const ORG_ID = 'org-1';
const THREAD_ID = 'thread-1';
const USER_ID = 'user-1';

const userMessage = {
  id: 'msg-user-1',
  role: 'USER',
  content: 'Jakie są zalety RAG?',
  attachments: null,
  createdAt: new Date('2026-01-01T10:00:00Z'),
};

const assistantMessage = {
  id: 'msg-asst-1',
  role: 'ASSISTANT',
  content: 'RAG pozwala...',
  attachments: null,
  createdAt: new Date('2026-01-01T10:00:05Z'),
};

describe('regenerateAssistantMessageCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockResolvedValue({});
  });

  it('happy path: zwraca prompt i attachments, usuwa wiadomość ASSISTANT', async () => {
    mockFindFirst.mockResolvedValue({
      id: THREAD_ID,
      messages: [userMessage, assistantMessage],
    });

    const result = await regenerateAssistantMessageCommand(
      THREAD_ID,
      ORG_ID,
      USER_ID,
    );

    expect(result).toEqual({
      success: true,
      data: {
        prompt: 'Jakie są zalety RAG?',
        attachments: [],
      },
    });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'msg-asst-1' } });
  });

  it('scope: filtruje po organizationId — zwraca error gdy wątek z innej org', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await regenerateAssistantMessageCommand(
      THREAD_ID,
      'other-org',
      USER_ID,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('zwraca error gdy brak wiadomości ASSISTANT w wątku', async () => {
    mockFindFirst.mockResolvedValue({
      id: THREAD_ID,
      messages: [userMessage],
    });

    const result = await regenerateAssistantMessageCommand(
      THREAD_ID,
      ORG_ID,
      USER_ID,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no assistant message/i);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('zwraca error gdy brak wiadomości USER przed ostatnim ASSISTANT', async () => {
    mockFindFirst.mockResolvedValue({
      id: THREAD_ID,
      messages: [assistantMessage],
    });

    const result = await regenerateAssistantMessageCommand(
      THREAD_ID,
      ORG_ID,
      USER_ID,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no user message/i);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('przekazuje attachments z wiadomości USER', async () => {
    const attachment = {
      name: 'doc.pdf',
      size: 1024,
      type: 'application/pdf',
      sourceUrl: 'https://example.com/doc.pdf',
    };
    const userWithAttachment = {
      ...userMessage,
      attachments: [attachment],
    };
    mockFindFirst.mockResolvedValue({
      id: THREAD_ID,
      messages: [userWithAttachment, assistantMessage],
    });

    const result = await regenerateAssistantMessageCommand(
      THREAD_ID,
      ORG_ID,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(result.data?.attachments).toEqual([attachment]);
  });

  it('sprawdza scope — where zawiera project.organizationId', async () => {
    mockFindFirst.mockResolvedValue(null);

    await regenerateAssistantMessageCommand(THREAD_ID, ORG_ID, USER_ID);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: THREAD_ID,
          project: { organizationId: ORG_ID },
        }),
      }),
    );
  });
});
