import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateText, mockTrackAiUsage } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockTrackAiUsage: vi.fn(),
}));

vi.mock('ai', async () => ({
  ...(await vi.importActual<typeof import('ai')>('ai')),
  generateText: mockGenerateText,
}));
vi.mock(
  '@/features/ai-usage/services/commands/create-ai-usage-command',
  () => ({ trackAiUsage: mockTrackAiUsage }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { LanguageModelV4 } from '@ai-sdk/provider';
import { sectionSelectionCall } from '../operations';

const model = { modelId: 'mistral-small-3.2' } as LanguageModelV4;

beforeEach(() => {
  vi.clearAllMocks();
  mockTrackAiUsage.mockResolvedValue(undefined);
  mockGenerateText.mockResolvedValue({
    text: '2, 1',
    usage: { inputTokens: 900, outputTokens: 4 },
  });
});

describe('sectionSelectionCall', () => {
  it('asks the selector at temperature 0 and returns its text', async () => {
    const text = await sectionSelectionCall(model)({
      system: 'sys',
      prompt: 'p',
    });
    expect(text).toBe('2, 1');
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        system: 'sys',
        prompt: 'p',
        temperature: 0,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('records the call as SECTION_SELECTION, a step of its own', async () => {
    await sectionSelectionCall(model, {
      organizationId: 'org-1',
      projectId: 'p-1',
      userId: 'u-1',
    })({ system: 's', prompt: 'p' });

    expect(mockTrackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        projectId: 'p-1',
        userId: 'u-1',
        step: 'SECTION_SELECTION',
        model: 'mistral-small-3.2',
        inputTokens: 900,
        outputTokens: 4,
        totalTokens: 904,
      }),
    );
  });

  it('records nothing without a tracking context', async () => {
    await sectionSelectionCall(model)({ system: 's', prompt: 'p' });
    expect(mockTrackAiUsage).not.toHaveBeenCalled();
  });
});
