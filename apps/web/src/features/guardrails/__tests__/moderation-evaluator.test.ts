import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    warn: (...a: unknown[]) => mockLoggerWarn(...a),
    error: (...a: unknown[]) => mockLoggerError(...a),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { evaluateModeration, isModerationRule, MODERATION_GUARDRAIL_KEY } =
  await import('../utils/moderation-evaluator');

const moderator = (results: unknown) =>
  ({ invoke: vi.fn().mockResolvedValue({ results }) }) as never;

beforeEach(() => vi.clearAllMocks());

describe('isModerationRule', () => {
  it('matches the built-in by kind and key together', () => {
    const base = { kind: 'BUILT_IN', key: MODERATION_GUARDRAIL_KEY } as never;
    expect(isModerationRule(base)).toBe(true);
  });

  it('does not match a pattern rule an operator happened to name that', () => {
    // The key is unique only among platform rules, and an organization's own
    // rule has `key: null` — but a future change could relax that, and
    // matching on the name alone would route someone's regex to OpenAI.
    expect(
      isModerationRule({
        kind: 'PATTERN',
        key: MODERATION_GUARDRAIL_KEY,
      } as never),
    ).toBe(false);
  });
});

describe('evaluateModeration', () => {
  it('passes text the provider does not flag', async () => {
    expect(
      await evaluateModeration(moderator([{ flagged: false }]), 'hi'),
    ).toEqual({ outcome: 'pass' });
  });

  it('reports a hit when the provider flags it', async () => {
    expect(
      await evaluateModeration(moderator([{ flagged: true }]), 'x'),
    ).toEqual({ outcome: 'hit' });
  });

  it('distinguishes an empty response from a clean bill of health', async () => {
    const verdict = await evaluateModeration(moderator([]), 'x');

    // `runModeration` threw ModerationError here, which the chain rendered to
    // the user as a content refusal — a provider shape problem presented as
    // "your message was rejected".
    expect(verdict).toEqual({ outcome: 'error', reason: 'no-results' });
  });

  it('treats a provider failure as an error, not a flag', async () => {
    const failing = {
      invoke: vi.fn().mockRejectedValue(new Error('429 rate limited')),
    } as never;

    const verdict = await evaluateModeration(failing, 'x');

    expect(verdict.outcome).toBe('error');
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  it('says so when the rule is enabled but no provider is configured', async () => {
    const verdict = await evaluateModeration(undefined, 'x');

    // Reachable: a rule can be enabled on an installation with no moderation
    // credentials. A misconfiguration worth a log, not a refused turn.
    expect(verdict).toEqual({
      outcome: 'error',
      reason: 'no-moderation-provider',
    });
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect((mockLoggerWarn.mock.calls[0][0] as { audit?: boolean }).audit).toBe(
      true,
    );
  });

  it('never resolves to a hit on a failure path', async () => {
    // The choice the jailbreak classifier already makes and the spec restates
    // for the judge: a classifier that can take the product down is a bigger
    // risk than the one it catches.
    const paths = [
      await evaluateModeration(undefined, 'x'),
      await evaluateModeration(moderator([]), 'x'),
      await evaluateModeration(
        { invoke: vi.fn().mockRejectedValue(new Error('boom')) } as never,
        'x',
      ),
    ];

    expect(paths.map((p) => p.outcome)).toEqual(['error', 'error', 'error']);
  });
});
