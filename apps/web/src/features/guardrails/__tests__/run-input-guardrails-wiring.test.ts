import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The binding's callbacks, in their own file.
 *
 * `evaluateInputStage` is mocked here at module level, which is why this is
 * not in the behavioural suite beside it: those 53 tests drive the real
 * evaluation and mocking it would hollow them out. ESM namespaces are not
 * configurable, so `vi.spyOn` on the package export is not available and a
 * per-test mock is not either.
 *
 * What is asserted is the wiring and nothing else — per `AGENTS.md`, a thin
 * binding is exactly where a mistake fails silently. The decisions themselves
 * belong to the package and are tested there, deterministically, with an
 * injected budget.
 */

const mockLoggerWarn = vi.fn();
const mockRecordHit = vi.fn();
const mockEvaluate = vi.fn();

vi.mock('@ragenai/guardrails', () => ({
  evaluateInputStage: (...a: unknown[]) => mockEvaluate(...a),
}));

vi.mock('../utils/record-guardrail-hit', () => ({
  recordGuardrailHit: (...a: unknown[]) => mockRecordHit(...a),
}));

vi.mock('../utils/moderation-evaluator', () => ({
  evaluateModeration: vi.fn().mockResolvedValue({ outcome: 'pass' }),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    warn: (...a: unknown[]) => mockLoggerWarn(...a),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { runInputGuardrailsCommand } =
  await import('../services/commands/run-input-guardrails-command');
const { GuardrailError } = await import('@/libs/chains/errors');

const someRule = {
  publicId: 'rule-1',
  key: null,
  name: 'Secrets',
  kind: 'PATTERN',
  action: 'LOG',
  severity: 'warn',
} as never;

const run = () =>
  runInputGuardrailsCommand({
    guardrails: {
      input: [someRule],
      output: [],
      hasTransformingInputRule: false,
      degraded: false,
      dropped: [],
    },
    moderator: undefined,
    question: 'q',
    chatHistory: 'h',
    moderateHistory: false,
    organizationId: 'org-1',
    userId: 'user-1',
    source: 'chat',
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mockEvaluate.mockResolvedValue({ question: 'q', chatHistory: 'h' });
});

describe('onBudgetExhausted', () => {
  it('becomes a log line the alerting can see', async () => {
    mockEvaluate.mockImplementation(
      async (
        _rules: unknown,
        input: { question: string; chatHistory: string },
        deps: {
          onBudgetExhausted: (s: unknown[], ms: number) => void;
        },
      ) => {
        deps.onBudgetExhausted([{ publicId: 'skipped-1' }], 42);
        return { question: input.question, chatHistory: input.chatHistory };
      },
    );

    await run();

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    const [context] = mockLoggerWarn.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    // `audit: true` is what puts it in front of somebody. Without it this is a
    // warning in a stream nobody reads, for a rule that protected nothing.
    expect(context.audit).toBe(true);
    expect(context.organizationId).toBe('org-1');
    expect(context.elapsedMs).toBe(42);
    expect(context.skipped).toEqual(['skipped-1']);
  });

  it('is silent when the package does not call it', async () => {
    await run();

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});

describe('record', () => {
  it('forwards the organization, user, source and stage', async () => {
    mockEvaluate.mockImplementation(
      async (
        _rules: unknown,
        input: { question: string; chatHistory: string },
        deps: { record: (h: unknown) => void },
      ) => {
        deps.record({ rule: someRule, matchCount: 3 });
        return { question: input.question, chatHistory: input.chatHistory };
      },
    );

    await run();

    expect(mockRecordHit).toHaveBeenCalledWith({
      rule: someRule,
      organizationId: 'org-1',
      userId: 'user-1',
      source: 'chat',
      stage: 'INPUT',
      matchCount: 3,
    });
  });
});

describe('blockedBy', () => {
  it('becomes a GuardrailError naming the rule', async () => {
    mockEvaluate.mockResolvedValue({
      question: 'q',
      chatHistory: 'h',
      blockedBy: { publicId: 'rule-1', key: 'no-secrets', name: 'Secrets' },
    });

    const error = await run().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GuardrailError);
    expect((error as InstanceType<typeof GuardrailError>).code).toBe(
      'guardrail-blocked',
    );
  });

  it('returns the package s text when nothing blocked', async () => {
    mockEvaluate.mockResolvedValue({
      question: 'masked q',
      chatHistory: 'masked h',
    });

    // The binding must return what the stage produced, not what it was given:
    // a caller that gets the original silently defeats every masking rule.
    await expect(run()).resolves.toEqual({
      question: 'masked q',
      chatHistory: 'masked h',
    });
  });
});
