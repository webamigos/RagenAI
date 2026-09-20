import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The API runtime's judge, and its bill.
 *
 * The same test as apps/web's, on purpose, because the thing being asserted is
 * that the two runtimes behave identically — and because this is the one where
 * an unbilled judge matters more: API traffic is automated, so the cost scales
 * with a customer's integration rather than with how often somebody types.
 */

const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockCreateChatCompletionInstance = vi.hoisted(() =>
  vi.fn(() => ({ modelId: 'gemini-2.5-flash' })),
);

vi.mock('ai', () => ({
  generateObject: (...a: unknown[]): unknown => mockGenerateObject(...a),
}));

vi.mock('../llm/model-instances.js', () => ({
  createChatCompletionInstance: (...a: unknown[]): unknown =>
    mockCreateChatCompletionInstance(...(a as [])),
}));

const { PolicyJudgeService } = await import('./policy-judge.service.js');
const { POLICY_JUDGE_MODEL, POLICY_JUDGE_SYSTEM_PROMPT } =
  await import('@ragenai/guardrails');

const rule = (over: Record<string, unknown> = {}) =>
  ({
    publicId: 'policy-1',
    organizationId: null,
    key: null,
    name: 'No competitor pricing',
    description: null,
    kind: 'LLM_POLICY',
    stage: 'INPUT',
    action: 'LOG',
    enabled: true,
    severity: 'warn',
    pattern: null,
    patternIsRegex: false,
    policy: 'Never discuss a competitor’s pricing.',
    threshold: null,
    ...over,
  }) as never;

const trackAiUsage = vi.fn().mockResolvedValue(undefined);

const judgeFor = (over: Record<string, unknown> = {}) =>
  new PolicyJudgeService().forTurn({
    organizationId: 'org-1',
    projectId: 'proj-1',
    userId: 'user-1',
    trackAiUsage,
    ...over,
  });

function answers(score: number, usage = { inputTokens: 90, outputTokens: 6 }) {
  mockGenerateObject.mockResolvedValue({ object: { score }, usage });
}

beforeEach(() => {
  vi.clearAllMocks();
  trackAiUsage.mockResolvedValue(undefined);
});

describe('what the judge costs', () => {
  it('records the call under the GUARDRAIL step', async () => {
    answers(0.1);

    await judgeFor()({ rule: rule(), text: 'hello' });

    expect(trackAiUsage).toHaveBeenCalledTimes(1);
    expect(trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'GUARDRAIL',
        organizationId: 'org-1',
        projectId: 'proj-1',
        userId: 'user-1',
        model: POLICY_JUDGE_MODEL,
        inputTokens: 90,
        outputTokens: 6,
        totalTokens: 96,
      }),
    );
  });

  it('still judges when no usage recorder was injected', async () => {
    // Refusing to guard a turn because telemetry is unavailable would be the
    // wrong trade. The gap is logged instead, because a judge whose cost is on
    // no page is worth seeing before the invoice arrives.
    answers(0.95);

    const verdict = await judgeFor({ trackAiUsage: undefined })({
      rule: rule(),
      text: 'hello',
    });

    expect(verdict).toEqual({ outcome: 'scored', score: 0.95 });
  });

  it('does not sink the turn when the usage write fails', async () => {
    answers(0.9);
    trackAiUsage.mockRejectedValue(new Error('database is down'));

    await expect(judgeFor()({ rule: rule(), text: 'hello' })).resolves.toEqual({
      outcome: 'scored',
      score: 0.9,
    });
  });
});

describe('what the judge is asked', () => {
  it('uses the shared model and prompt, the same ones apps/web uses', async () => {
    answers(0.2);

    await judgeFor()({ rule: rule(), text: 'what do they charge?' });

    expect(mockCreateChatCompletionInstance).toHaveBeenCalledWith(
      expect.objectContaining({ model: POLICY_JUDGE_MODEL, temperature: 0 }),
    );
    const [call] = mockGenerateObject.mock.calls[0] as [
      { system: string; messages: { content: string }[] },
    ];
    expect(call.system).toBe(POLICY_JUDGE_SYSTEM_PROMPT);
    expect(call.messages[0].content).toContain(
      'Never discuss a competitor’s pricing.',
    );
  });
});

describe('when the judge cannot answer', () => {
  it('returns an error rather than a score of zero', async () => {
    mockGenerateObject.mockRejectedValue(new Error('provider exploded'));

    const verdict = await judgeFor()({ rule: rule(), text: 'hello' });

    expect(verdict.outcome).toBe('error');
  });

  it('records no usage for a call that produced none', async () => {
    mockGenerateObject.mockRejectedValue(new Error('timeout'));

    await judgeFor()({ rule: rule(), text: 'hello' });

    expect(trackAiUsage).not.toHaveBeenCalled();
  });
});
