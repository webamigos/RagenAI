import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The judge, and its bill.
 *
 * Phase C1 is one step for one reason: *a judge that runs without recording
 * its cost is the thing C2 was supposed to prevent.* That sentence is only
 * true if something checks it — a model call and a `trackAiUsage` call in the
 * same file are two independent things, and dropping the second breaks
 * nothing anyone can see. The AI-usage page would simply show an
 * organization's spend rising with no step accounting for it.
 *
 * So the first test here is the one about money, and the rest are about the
 * judge not being able to take a turn down.
 */

const mockGenerateObject = vi.fn();
const mockTrackAiUsage = vi.fn().mockResolvedValue(undefined);
const mockCreateChatCompletionInstance = vi.fn(() => ({
  modelId: 'gemini-2.5-flash',
}));

vi.mock('ai', () => ({
  generateObject: (...a: unknown[]) => mockGenerateObject(...a),
}));

vi.mock('@/app/lib/services/llm', () => ({
  createChatCompletionInstance: (...a: unknown[]) =>
    mockCreateChatCompletionInstance(...(a as [])),
}));

vi.mock(
  '@/features/ai-usage/services/commands/create-ai-usage-command',
  () => ({
    trackAiUsage: (...a: unknown[]) => mockTrackAiUsage(...a),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const { createPolicyJudge } = await import('../utils/policy-judge');
const { POLICY_JUDGE_MODEL, POLICY_JUDGE_SYSTEM_PROMPT, judgeRequestFor } =
  await import('@ragenai/guardrails');

type Rule = Parameters<ReturnType<typeof createPolicyJudge>>[0]['rule'];

const rule = (over: Partial<Rule> = {}): Rule =>
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
  }) as Rule;

const tracking = {
  organizationId: 'org-1',
  projectId: 'proj-1',
  userId: 'user-1',
};

function answers(score: number, usage = { inputTokens: 120, outputTokens: 8 }) {
  mockGenerateObject.mockResolvedValue({ object: { score }, usage });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTrackAiUsage.mockResolvedValue(undefined);
});

describe('what the judge costs', () => {
  it('records the call under AiUsageStep.GUARDRAIL', async () => {
    // `GUARDRAIL` and not `MODERATION`: the AI-usage page has to be able to
    // answer "what did the guardrails cost", which is the question an
    // operator asks precisely because policy rules are the expensive kind.
    answers(0.1);

    await createPolicyJudge({ tracking })(judgeRequestFor(rule(), 'hello'));

    expect(mockTrackAiUsage).toHaveBeenCalledTimes(1);
    expect(mockTrackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'GUARDRAIL',
        organizationId: 'org-1',
        projectId: 'proj-1',
        userId: 'user-1',
        model: POLICY_JUDGE_MODEL,
        inputTokens: 120,
        outputTokens: 8,
        totalTokens: 128,
      }),
    );
  });

  it('records the cost of a judge that found nothing, not only of a hit', async () => {
    // The call was made and billed either way. Recording only the hits would
    // under-report the spend by however often the policy is *not* violated,
    // which on a working rule set is nearly always.
    answers(0);

    await createPolicyJudge({ tracking })(judgeRequestFor(rule(), 'hello'));

    expect(mockTrackAiUsage).toHaveBeenCalledTimes(1);
  });

  it('does not sink the turn when the usage write fails', async () => {
    // Broken telemetry must not break chat. `trackAiUsage` swallows its own
    // database errors, and this asserts the rejection cannot escape here
    // either — an unhandled rejection in a Next server takes the process out.
    answers(0.9);
    mockTrackAiUsage.mockRejectedValue(new Error('database is down'));

    const verdict = await createPolicyJudge({ tracking })(
      judgeRequestFor(rule(), 'hello'),
    );

    expect(verdict).toEqual({ outcome: 'scored', score: 0.9 });
  });
});

describe('what the judge is asked', () => {
  it('uses the shared model and prompt, not one of its own', async () => {
    // apps/api has a judge too. Two runtimes asking a different question is
    // two products, and the public API is the one nobody would notice was
    // wrong — so both read these out of `@ragenai/guardrails`.
    answers(0.2);

    await createPolicyJudge({ tracking })(
      judgeRequestFor(rule(), 'what do they charge?'),
    );

    expect(mockCreateChatCompletionInstance).toHaveBeenCalledWith(
      expect.objectContaining({ model: POLICY_JUDGE_MODEL, temperature: 0 }),
      false,
    );
    const [call] = mockGenerateObject.mock.calls[0] as [
      { system: string; messages: { content: string }[] },
    ];
    expect(call.system).toBe(POLICY_JUDGE_SYSTEM_PROMPT);
    expect(call.messages[0].content).toContain(
      'Never discuss a competitor’s pricing.',
    );
    expect(call.messages[0].content).toContain('what do they charge?');
  });
});

describe('when the judge cannot answer', () => {
  it('returns an error rather than a score of zero', async () => {
    // A judge that timed out and a judge that read the message and found
    // nothing are the same value and different events. Only one of them is
    // worth an operator's attention.
    mockGenerateObject.mockRejectedValue(new Error('provider exploded'));

    const verdict = await createPolicyJudge({ tracking })(
      judgeRequestFor(rule(), 'hello'),
    );

    expect(verdict.outcome).toBe('error');
  });

  it('never throws, so one bad rule cannot refuse a turn', async () => {
    mockGenerateObject.mockRejectedValue(new Error('provider exploded'));

    await expect(
      createPolicyJudge({ tracking })(judgeRequestFor(rule(), 'hello')),
    ).resolves.toBeDefined();
  });

  it('records no usage for a call that produced none', async () => {
    mockGenerateObject.mockRejectedValue(new Error('timeout'));

    await createPolicyJudge({ tracking })(judgeRequestFor(rule(), 'hello'));

    expect(mockTrackAiUsage).not.toHaveBeenCalled();
  });

  it('truncates the provider’s message rather than storing it whole', async () => {
    // Provider errors have been known to echo the request back, and the
    // request contains the customer's message.
    mockGenerateObject.mockRejectedValue(new Error('x'.repeat(500)));

    const verdict = await createPolicyJudge({ tracking })(
      judgeRequestFor(rule(), 'hello'),
    );

    expect(
      verdict.outcome === 'error' ? verdict.reason.length : 0,
    ).toBeLessThanOrEqual(120);
  });
});
