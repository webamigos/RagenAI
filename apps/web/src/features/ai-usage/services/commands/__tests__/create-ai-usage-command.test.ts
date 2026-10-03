import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { aiUsage: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
vi.mock(
  '@/features/teams/services/queries/check-team-rate-limit-query',
  () => ({
    chargeTeamTokenUsage: vi.fn(),
  }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';
import { createAiUsageCommand } from '../create-ai-usage-command';

const input = {
  organizationId: 'org-1',
  projectId: 'project-1',
  userId: 'user-1',
  teamId: 'team-1',
  threadId: 'thread-1',
  step: 'CHAT_COMPLETION' as const,
  provider: 'openai',
  model: 'gpt-4o-mini',
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
  estimatedCost: 0.01,
};

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({});
});

describe('createAiUsageCommand', () => {
  it('writes the organization as its column, which the tenant-scope guard reads', async () => {
    await createAiUsageCommand(input);

    const args = mockCreate.mock.calls[0][0];
    expect(args.data).toMatchObject({
      organizationId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
      teamId: 'team-1',
      threadId: 'thread-1',
    });
    expect(args.data).not.toHaveProperty('organization');
    expect(isTenantScopeSatisfied('AiUsage', 'create', args)).toBe(true);
  });

  it('stores null for the optional owners it was not given', async () => {
    await createAiUsageCommand({
      ...input,
      projectId: undefined,
      userId: '',
      teamId: null,
      threadId: undefined,
    });

    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      projectId: null,
      userId: null,
      teamId: null,
      threadId: null,
    });
  });
});
