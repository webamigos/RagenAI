import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordSecurityEvent = vi.fn();

vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({
    recordSecurityEvent: (...a: unknown[]) => mockRecordSecurityEvent(...a),
  }),
);

const { eventTypeFor, recordGuardrailHit } =
  await import('../utils/record-guardrail-hit');

type Rule = Parameters<typeof eventTypeFor>[0];

const rule = (over: Partial<Rule> = {}): Rule =>
  ({
    publicId: 'rule-1',
    organizationId: null,
    key: 'content-moderation',
    name: 'Content moderation',
    description: null,
    kind: 'BUILT_IN',
    stage: 'INPUT',
    action: 'LOG',
    enabled: true,
    severity: 'warn',
    pattern: null,
    patternIsRegex: false,
    threshold: null,
    isPlatformRule: true,
    sources: {
      enabled: 'platform-rule',
      action: 'platform-rule',
      threshold: 'platform-rule',
    },
    ...over,
  }) as Rule;

beforeEach(() => vi.clearAllMocks());

describe('eventTypeFor', () => {
  it('files a BLOCK as blocked', () => {
    expect(eventTypeFor(rule({ action: 'BLOCK' }))).toBe('GUARDRAIL_BLOCKED');
  });

  it.each(['LOG', 'MASK'] as const)('files a %s as flagged', (action) => {
    // MASK deliberately shares FLAGGED with LOG: something was found and the
    // turn continued, which is the same story. A third member would mean a
    // schema change every time an action is added.
    expect(eventTypeFor(rule({ action }))).toBe('GUARDRAIL_FLAGGED');
  });
});

describe('recordGuardrailHit', () => {
  const hit = (over = {}) => ({
    rule: rule(),
    organizationId: 'org-1',
    userId: 'user-1',
    source: 'chat' as const,
    stage: 'INPUT' as const,
    ...over,
  });

  it('records the event against the organization and the user', () => {
    recordGuardrailHit(hit());

    expect(mockRecordSecurityEvent).toHaveBeenCalledTimes(1);
    const [input] = mockRecordSecurityEvent.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(input.organizationId).toBe('org-1');
    expect(input.userId).toBe('user-1');
    expect(input.source).toBe('chat');
  });

  it('uses the rule s own severity, not a constant', () => {
    recordGuardrailHit(hit({ rule: rule({ severity: 'info' }) }));

    const [input] = mockRecordSecurityEvent.mock.calls[0] as [
      Record<string, unknown>,
    ];
    // An operator who set a rule to `info` said it was noise. Overriding that
    // here would make the alerting threshold unreachable and the incidents
    // page unreadable.
    expect(input.severity).toBe('info');
  });

  it('carries a count of matches and never the matched text', () => {
    recordGuardrailHit(hit({ matchCount: 3 }));

    const [input] = mockRecordSecurityEvent.mock.calls[0] as [
      { metadata: Record<string, unknown> },
    ];
    expect(input.metadata.matchCount).toBe(3);

    // The matched span is the customer's message. This product encrypts those
    // per organization and scrubs them out of logs; an event carrying one
    // would put customer content into a table the admin panel renders in
    // plain text for every operator.
    //
    // Asserted as an allow-list of keys rather than by searching the
    // serialized value for suspicious words. The first version of this test
    // did the latter and failed on `content-moderation` — the rule's own key —
    // which is the lesson: a negative match over free text cannot tell the
    // difference between a field name and a payload. An allow-list fails the
    // moment a field is added, which is exactly when a human should look.
    expect(Object.keys(input.metadata).sort()).toEqual([
      'action',
      'guardrail',
      'kind',
      'matchCount',
      'rule',
      'stage',
    ]);
  });

  it('omits the count rather than sending undefined when there is none', () => {
    recordGuardrailHit(hit());

    const [input] = mockRecordSecurityEvent.mock.calls[0] as [
      { metadata: Record<string, unknown> },
    ];
    expect('matchCount' in input.metadata).toBe(false);
  });

  it('identifies a built-in by key and an operator s rule by name', () => {
    recordGuardrailHit(hit());
    expect(
      (
        mockRecordSecurityEvent.mock.calls[0][0] as {
          metadata: { rule: string };
        }
      ).metadata.rule,
    ).toBe('content-moderation');

    mockRecordSecurityEvent.mockClear();
    recordGuardrailHit(hit({ rule: rule({ key: null, name: 'My own rule' }) }));
    expect(
      (
        mockRecordSecurityEvent.mock.calls[0][0] as {
          metadata: { rule: string };
        }
      ).metadata.rule,
    ).toBe('My own rule');
  });

  it('returns without waiting for the event to be written', () => {
    // `recordSecurityEvent` writes a row, may send mail, and swallows its own
    // failures. Awaiting it would put all of that on the turn's critical path.
    expect(recordGuardrailHit(hit())).toBeUndefined();
  });
});
