import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedGuardrail } from '@ragenai/guardrails';

const mockRecordSecurityEvent = vi.fn();
const mockWarn = vi.fn();

vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({
    recordSecurityEvent: (...a: unknown[]) => mockRecordSecurityEvent(...a),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: (...a: unknown[]) => mockWarn(...a) },
}));

const { createOutputGuardrailsCommand } =
  await import('../services/commands/create-output-guardrails-command');

/**
 * The binding, tested apart from the window it binds.
 *
 * `AGENTS.md` names this shape exactly: a thin file that is the only place a
 * piece of wiring exists, where a mistake fails silently. Two could go wrong
 * here and neither would throw — a hit filed against the input stage, so an
 * operator filtering the incidents page for output blocks finds nothing; and
 * a stage built for an organization with no output rules, which buffers every
 * answer in the product for no reason.
 */

const rule = (over: Partial<ResolvedGuardrail> = {}): ResolvedGuardrail =>
  ({
    publicId: 'rule-1',
    organizationId: null,
    key: null,
    name: 'Secrets',
    description: null,
    kind: 'PATTERN',
    stage: 'OUTPUT',
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
  }) as ResolvedGuardrail;

const guardrails = (output: ResolvedGuardrail[]) => ({
  input: [],
  output,
  degraded: false,
  dropped: [],
});

beforeEach(() => {
  mockRecordSecurityEvent.mockClear();
  mockWarn.mockClear();
});

/** The window of a guard the test knows is windowed. */
const windowOf = (guard: ReturnType<typeof createOutputGuardrailsCommand>) => {
  if (guard?.mode !== 'window') {
    throw new Error('expected a windowed guard, got ' + String(guard?.mode));
  }
  return guard.stage;
};

describe('createOutputGuardrailsCommand', () => {
  it('builds nothing when the organization has no output rules', () => {
    expect(
      createOutputGuardrailsCommand({
        guardrails: guardrails([]),
        organizationId: 'org-1',
        source: 'chat',
      }),
    ).toBeUndefined();
  });

  it('builds nothing for a turn with no organization in scope', () => {
    // A surface that does not say which organization it serves cannot be
    // given that organization's rules. It is also the state every guest and
    // widget turn is in before the thread is resolved.
    expect(
      createOutputGuardrailsCommand({
        guardrails: guardrails([rule()]),
        organizationId: null,
        source: 'chat',
      }),
    ).toBeUndefined();
  });

  it('files a hit against the output stage, with the surface it arrived on', () => {
    const stage = windowOf(
      createOutputGuardrailsCommand({
        guardrails: guardrails([rule()]),
        organizationId: 'org-1',
        userId: 'user-1',
        source: 'chatbot',
      }),
    );

    stage.push('the key is hunter2 and that is all');
    stage.flush();

    expect(mockRecordSecurityEvent).toHaveBeenCalledTimes(1);
    const event = mockRecordSecurityEvent.mock.calls[0][0];
    expect(event.eventType).toBe('GUARDRAIL_FLAGGED');
    expect(event.source).toBe('chatbot');
    expect(event.organizationId).toBe('org-1');
    expect(event.metadata.stage).toBe('OUTPUT');
    expect(event.metadata.matchCount).toBe(1);
  });

  it('never puts the matched text in the event', () => {
    const stage = windowOf(
      createOutputGuardrailsCommand({
        guardrails: guardrails([rule()]),
        organizationId: 'org-1',
        source: 'chat',
      }),
    );

    stage.push('the key is hunter2');
    stage.flush();

    expect(JSON.stringify(mockRecordSecurityEvent.mock.calls)).not.toContain(
      'hunter2',
    );
  });

  it('logs a skipped rule rather than filing it as a hit', () => {
    // An event says a rule fired. A rule that could not run is the opposite
    // claim, and filing it as one puts a row on the incidents page for a
    // budget problem and inflates the hit counts on the guardrails page.
    //
    // A zero budget with a stopped clock is what a misbehaving pattern looks
    // like from here, and it is the only way to reach this branch without
    // depending on how fast the machine is.
    const stage = windowOf(
      createOutputGuardrailsCommand(
        {
          guardrails: guardrails([rule()]),
          organizationId: 'org-1',
          source: 'chat',
        },
        { budgetMs: 0, now: () => 1_000 },
      ),
    );

    stage.push('the key is hunter2');
    stage.flush();

    expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toMatchObject({
      audit: true,
      organizationId: 'org-1',
      skipped: ['rule-1'],
    });
  });
});
