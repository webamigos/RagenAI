import { describe, expect, it, vi, beforeEach } from 'vitest';

import { GuardrailError } from '../chains/errors.js';
import { RunInputGuardrailsService } from './run-input-guardrails.service.js';
import type { OrgGuardrails } from './guardrails.service.js';

/**
 * The binding, not the evaluation.
 *
 * What a rule *does* is `evaluateInputStage` in `@ragenai/guardrails` and is
 * tested there once, for both runtimes. What is tested here is the three
 * things this app owns: the moderation factory is only called when a rule
 * needs it, an event carries the rule's severity and no matched text, and a
 * refusal becomes a `GuardrailError` rather than a thrown provider error.
 */

const record = vi.fn();
/**
 * The judge is a stub that scores zero, so nothing here depends on a model.
 * Overridden per test where a policy rule is the subject — see the
 * `PolicyJudgeService` spec for what the real one does with the score.
 */
const judge = vi.fn().mockResolvedValue({ outcome: 'scored', score: 0 });
const service = () =>
  new RunInputGuardrailsService(
    { record } as never,
    {
      forTurn: () => judge,
    } as never,
  );

const rule = (over: Record<string, unknown> = {}) =>
  ({
    publicId: 'rule-1',
    organizationId: null,
    key: null,
    name: 'Secrets',
    description: null,
    kind: 'PATTERN',
    stage: 'INPUT',
    action: 'LOG',
    enabled: true,
    severity: 'warn',
    pattern: 'hunter2',
    patternIsRegex: false,
    threshold: null,
    isPlatformRule: true,
    sources: {
      enabled: 'platform-rule',
      action: 'platform-rule',
      threshold: 'platform-rule',
    },
    ...over,
  }) as never;

const guardrails = (input: unknown[] = []): OrgGuardrails =>
  ({
    input,
    output: [],
    degraded: false,
  }) as OrgGuardrails;

const run = (over: Record<string, unknown> = {}) =>
  service().run({
    guardrails: guardrails(),
    moderator: () => ({ invoke: vi.fn() }) as never,
    question: 'hello',
    chatHistory: '',
    moderateHistory: false,
    organizationId: 'org-1',
    userId: 'user-1',
    source: 'api',
    ...over,
  } as never);

beforeEach(() => vi.clearAllMocks());

describe('the moderation factory', () => {
  it('is not called when no rule needs it', async () => {
    const factory = vi.fn();
    await run({ guardrails: guardrails([rule()]), moderator: factory });

    // `createModerationInstance()` throws without an OpenAI key. Calling it
    // for an organization whose rules are all patterns would fail a chat
    // request for a feature the installation is not using — the failure the
    // factory in `BaseChatChainModels` exists to prevent.
    expect(factory).not.toHaveBeenCalled();
  });

  it('is called once when the built-in is enabled', async () => {
    const invoke = vi.fn().mockResolvedValue({ results: [{ flagged: false }] });
    const factory = vi.fn(() => ({ invoke }) as never);

    await run({
      guardrails: guardrails([
        rule({ kind: 'BUILT_IN', key: 'content-moderation', pattern: null }),
      ]),
      moderator: factory,
    });

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('treats a factory that throws as a misconfiguration, not a refusal', async () => {
    const factory = vi.fn(() => {
      throw new Error('OPENAI_API_KEY is not set');
    });

    await expect(
      run({
        guardrails: guardrails([
          rule({
            kind: 'BUILT_IN',
            key: 'content-moderation',
            pattern: null,
            action: 'BLOCK',
          }),
        ]),
        moderator: factory,
      }),
    ).resolves.toBeDefined();
  });
});

describe('a refusal', () => {
  it('is a GuardrailError carrying the stable code', async () => {
    const error = await run({
      guardrails: guardrails([rule({ action: 'BLOCK' })]),
      question: 'hunter2',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GuardrailError);
    // apps/api has no locale layer, so this code is what the caller renders.
    expect((error as GuardrailError).code).toBe('guardrail-blocked');
  });

  it('does not carry the matched text', async () => {
    const error = (await run({
      guardrails: guardrails([rule({ action: 'BLOCK' })]),
      question: 'my password is hunter2',
    }).catch((e: unknown) => e)) as Error;

    expect(JSON.stringify({ m: error.message, ...error })).not.toContain(
      'hunter2',
    );
  });
});

describe('the recorded event', () => {
  it('uses the rule s own severity and the api source', async () => {
    await run({
      guardrails: guardrails([rule({ action: 'LOG', severity: 'info' })]),
      question: 'hunter2',
    });

    expect(record).toHaveBeenCalledTimes(1);
    const [input] = record.mock.calls[0] as [Record<string, unknown>];
    expect(input.severity).toBe('info');
    expect(input.source).toBe('api');
    expect(input.eventType).toBe('GUARDRAIL_FLAGGED');
  });

  it('files a BLOCK as blocked', async () => {
    await run({
      guardrails: guardrails([rule({ action: 'BLOCK' })]),
      question: 'hunter2',
    }).catch(() => undefined);

    expect((record.mock.calls[0][0] as { eventType: string }).eventType).toBe(
      'GUARDRAIL_BLOCKED',
    );
  });

  it('carries a count and an allow-listed set of keys, never the text', async () => {
    await run({
      guardrails: guardrails([rule({ action: 'LOG' })]),
      question: 'hunter2 and hunter2',
    });

    const [input] = record.mock.calls[0] as [
      { metadata: Record<string, unknown> },
    ];
    expect(input.metadata.matchCount).toBe(2);
    expect(Object.keys(input.metadata).sort()).toEqual([
      'action',
      'guardrail',
      'kind',
      'matchCount',
      'rule',
      'stage',
    ]);
  });
});

describe('MASK', () => {
  it('returns rewritten text for the caller to carry on with', async () => {
    const result = await run({
      guardrails: guardrails([rule({ action: 'MASK' })]),
      question: 'my password is hunter2',
      chatHistory: 'earlier: hunter2',
    });

    expect(result.question).not.toContain('hunter2');
    // Every turn, against every mask rule — the stored message is the
    // original, so a history left alone undoes the mask at the next turn.
    expect(result.chatHistory).not.toContain('hunter2');
  });
});
