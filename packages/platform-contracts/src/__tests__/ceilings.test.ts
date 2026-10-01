import { describe, expect, it } from 'vitest';

import {
  CHAT_TURN_STEP,
  evaluateCeilings,
  usageMonthStart,
} from '../usage/ceilings';

const NO_LIMITS = {
  monthlyTokenLimit: null,
  monthlyCostLimitCents: null,
  monthlyMessageLimit: null,
};

describe('usageMonthStart', () => {
  it('is the first of the month at 00:00 UTC, whatever the local time', () => {
    expect(usageMonthStart(new Date('2026-10-31T23:59:59Z'))).toEqual(
      new Date('2026-10-01T00:00:00Z'),
    );
    expect(usageMonthStart(new Date('2026-01-01T00:00:00Z'))).toEqual(
      new Date('2026-01-01T00:00:00Z'),
    );
  });
});

describe('evaluateCeilings', () => {
  it('reaches a ceiling at the limit, not past it', () => {
    const result = evaluateCeilings(
      {
        monthlyTokenLimit: 100,
        monthlyCostLimitCents: 500,
        monthlyMessageLimit: 10,
      },
      { totalTokens: 100, totalCostDollars: 5, chatMessages: 10 },
    );
    expect(result.exceeded).toEqual(['tokens', 'cost', 'messages']);
  });

  it('stays under every ceiling one short of it', () => {
    const result = evaluateCeilings(
      {
        monthlyTokenLimit: 100,
        monthlyCostLimitCents: 500,
        monthlyMessageLimit: 10,
      },
      { totalTokens: 99, totalCostDollars: 4.99, chatMessages: 9 },
    );
    expect(result.exceeded).toEqual([]);
  });

  it('treats a null limit as none, however large the usage', () => {
    expect(
      evaluateCeilings(NO_LIMITS, {
        totalTokens: 1e12,
        totalCostDollars: 1e9,
        chatMessages: 1e9,
      }).exceeded,
    ).toEqual([]);
  });

  it('rounds dollars to cents and reads missing sums as zero', () => {
    expect(
      evaluateCeilings(NO_LIMITS, {
        totalTokens: null,
        totalCostDollars: 0.125,
        chatMessages: 0,
      }).current,
    ).toEqual({ totalTokens: 0, totalCostCents: 13, totalMessages: 0 });
    expect(
      evaluateCeilings(NO_LIMITS, {
        totalTokens: undefined,
        totalCostDollars: null,
        chatMessages: 3,
      }).current,
    ).toEqual({ totalTokens: 0, totalCostCents: 0, totalMessages: 3 });
  });

  it('counts chat turns as the step the message ceiling reads', () => {
    expect(CHAT_TURN_STEP).toBe('CHAT_COMPLETION');
  });
});
