import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockProjectFindFirst = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
  },
}));

import { getAnswerFromDocumentsOnlyQuery } from '../get-answer-from-documents-only-query';

describe('getAnswerFromDocumentsOnlyQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the project scoped by organization', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    await getAnswerFromDocumentsOnlyQuery('proj-1', 'org-1');

    expect(mockProjectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proj-1', organizationId: 'org-1' },
      }),
    );
  });

  it("keeps today's rule for a project not found in the organization", async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    await expect(
      getAnswerFromDocumentsOnlyQuery('proj-1', 'org-1'),
    ).resolves.toBe(false);
  });

  it.each([
    // No settings row at all: the surface decides.
    [null, true, true],
    [null, false, false],
    [{ answerFromDocumentsOnly: null }, true, true],
    [{ answerFromDocumentsOnly: null }, false, false],
    [{ answerFromDocumentsOnly: true }, false, true],
    [{ answerFromDocumentsOnly: false }, true, false],
  ])(
    'settings %o with chatbot %s resolves to %s',
    async (settings, chatbotEnabled, expected) => {
      mockProjectFindFirst.mockResolvedValue({ chatbotEnabled, settings });

      await expect(
        getAnswerFromDocumentsOnlyQuery('proj-1', 'org-1'),
      ).resolves.toBe(expected);
    },
  );
});
