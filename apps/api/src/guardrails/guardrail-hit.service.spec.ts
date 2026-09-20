import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedGuardrail } from '@ragenai/guardrails';

import { GuardrailHitService } from './guardrail-hit.service.js';

/**
 * What a hit looks like in `security_events` — decided once, for both stages.
 *
 * It was decided inside the input binding, and the output window was about to
 * decide it again. Three things could go wrong in a second copy and none of
 * them would throw: the wrong event type for the action, the matched text
 * ending up in the row, and `stage` spelled differently — at which point an
 * operator filtering the incidents page for output blocks finds half of them.
 */

const rule = (over: Partial<ResolvedGuardrail> = {}): ResolvedGuardrail => ({
  publicId: 'rule-1',
  organizationId: null,
  key: null,
  name: 'Card numbers',
  description: null,
  kind: 'PATTERN',
  stage: 'OUTPUT',
  action: 'LOG',
  enabled: true,
  severity: 'info',
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
});

describe('GuardrailHitService', () => {
  let record: ReturnType<typeof vi.fn>;
  let service: GuardrailHitService;

  beforeEach(() => {
    record = vi.fn();
    service = new GuardrailHitService({ record } as never);
  });

  /**
   * The row as `SecurityEventService` receives it.
   *
   * Typed rather than read off an `any`, because this app lints with
   * type-aware rules and a `mock.calls[0][0]` is `any` — every assertion below
   * would be an unsafe member access, which is how a test comes to assert
   * against a property that no longer exists.
   */
  type WrittenEvent = {
    eventType: string;
    severity: string;
    source: string;
    organizationId: string;
    userId: string | null;
    metadata: Record<string, unknown>;
  };

  const written = (): WrittenEvent => record.mock.calls[0][0] as WrittenEvent;

  it('files a BLOCK as blocked and everything else as flagged', () => {
    service.record({
      rule: rule({ action: 'BLOCK' }),
      stage: 'OUTPUT',
      source: 'api',
      organizationId: 'org-1',
    });
    expect(written().eventType).toBe('GUARDRAIL_BLOCKED');

    record.mockClear();
    service.record({
      rule: rule({ action: 'MASK' }),
      stage: 'OUTPUT',
      source: 'api',
      organizationId: 'org-1',
    });
    // `MASK` shares the flagged event with `LOG`: something was found and the
    // turn continued, which is the same story.
    expect(written().eventType).toBe('GUARDRAIL_FLAGGED');
  });

  it('says which stage fired, because a BOTH rule can fire at either', () => {
    service.record({
      rule: rule({ stage: 'BOTH' }),
      stage: 'OUTPUT',
      source: 'api',
      organizationId: 'org-1',
    });

    expect(written().metadata.stage).toBe('OUTPUT');
  });

  it("keeps the rule's own severity rather than a constant", () => {
    // An operator who set a rule to `info` said it was noise. Overriding that
    // makes the alerting threshold unreachable and the page unreadable.
    service.record({
      rule: rule({ severity: 'info' }),
      stage: 'INPUT',
      source: 'api',
      organizationId: 'org-1',
    });

    expect(written().severity).toBe('info');
  });

  it('carries a count and never the text that matched', () => {
    // The matched span is the caller's own message or the answer to it, and
    // this table is rendered in plain text in the admin panel. The count is
    // what tells a false positive from a real one.
    service.record({
      rule: rule(),
      stage: 'OUTPUT',
      source: 'api',
      organizationId: 'org-1',
      matchCount: 3,
    });

    expect(written().metadata.matchCount).toBe(3);
    expect(JSON.stringify(written())).not.toContain('hunter2');
  });

  it('leaves out a count and a score that were not given', () => {
    // Rather than writing `undefined` into the JSON column, which reads on the
    // incidents page as a rule that matched nothing.
    service.record({
      rule: rule(),
      stage: 'OUTPUT',
      source: 'chatbot',
      organizationId: 'org-1',
    });

    expect(Object.keys(written().metadata)).not.toContain('matchCount');
    expect(Object.keys(written().metadata)).not.toContain('score');
  });
});
