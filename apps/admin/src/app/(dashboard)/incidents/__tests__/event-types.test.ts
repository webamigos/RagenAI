import { describe, expect, it } from 'vitest';

import { SecurityEventType } from '../../../../../../web/src/generated/prisma/enums';
import {
  EVENT_TYPE_GROUPS,
  GUARDRAILS_FILTER,
  GUARDRAIL_EVENT_TYPES,
  parseEventTypeFilter,
} from '../event-types';

describe('parseEventTypeFilter', () => {
  it('passes a real event type through', () => {
    expect(parseEventTypeFilter('AUTH_LOGIN_FAILED')).toBe('AUTH_LOGIN_FAILED');
  });

  it('turns the guardrails filter into both guardrail event types', () => {
    // Blocked alone under-reports what the rule set did by exactly the amount
    // observation mode was built to show.
    expect(parseEventTypeFilter(GUARDRAILS_FILTER)).toEqual({
      in: ['GUARDRAIL_BLOCKED', 'GUARDRAIL_FLAGGED'],
    });
  });

  it('narrows nothing for a value that is not an event type', () => {
    // These reached Prisma as an unknown enum value and threw, so a mistyped
    // filter answered with a stack trace instead of a table.
    expect(
      parseEventTypeFilter('AUTH_LOGIN_FAILED; DROP TABLE'),
    ).toBeUndefined();
    expect(parseEventTypeFilter('auth_login_failed')).toBeUndefined();
    expect(parseEventTypeFilter('constructor')).toBeUndefined();
    expect(parseEventTypeFilter('toString')).toBeUndefined();
  });

  it('narrows nothing for an absent filter', () => {
    expect(parseEventTypeFilter(undefined)).toBeUndefined();
    expect(parseEventTypeFilter(null)).toBeUndefined();
    expect(parseEventTypeFilter('')).toBeUndefined();
  });
});

describe('the offered options', () => {
  const offered = EVENT_TYPE_GROUPS.flatMap((group) =>
    group.options.map((option) => option.value),
  );

  it('offers every event type the schema has', () => {
    // The point of the list. A member added to the schema and forgotten here
    // is a filter nobody can select — which is how `GUARDRAIL_FLAGGED` would
    // have stayed unreachable behind a free-text box.
    const missing = Object.values(SecurityEventType).filter(
      (type) => !offered.includes(type),
    );

    expect(missing).toEqual([]);
  });

  it('offers each one exactly once', () => {
    expect(offered).toHaveLength(new Set(offered).size);
  });

  it('offers nothing the parser would then ignore', () => {
    for (const value of offered) {
      expect(parseEventTypeFilter(value)).toBeDefined();
    }
  });

  it('leads with the guardrail questions', () => {
    // Deliberate ordering: the panel's newest surface authors these rules, and
    // "what did they do" is the question that brings an operator here.
    expect(EVENT_TYPE_GROUPS[0].label).toBe('Guardrails');
    expect(GUARDRAIL_EVENT_TYPES).toEqual([
      'GUARDRAIL_BLOCKED',
      'GUARDRAIL_FLAGGED',
    ]);
  });
});
