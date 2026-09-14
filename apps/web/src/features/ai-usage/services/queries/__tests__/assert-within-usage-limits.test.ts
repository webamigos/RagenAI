import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  assertWithinUsageLimits,
  isUsageLimitRefusal,
  UsageLimitError,
  CHAT_USAGE_DIMENSIONS,
} from '../assert-within-usage-limits';
import type { UsageLimitStatus } from '../check-usage-limits-query';

function status(
  exceeded: Partial<UsageLimitStatus['exceeded']> = {},
): UsageLimitStatus {
  const flags = {
    tokens: false,
    cost: false,
    messages: false,
    apiRequests: false,
    ...exceeded,
  };
  return {
    limits: {
      monthlyTokenLimit: 1000,
      monthlyCostLimitCents: 500,
      monthlyMessageLimit: 100,
      monthlyApiRequestLimit: 100,
    } as UsageLimitStatus['limits'],
    current: {
      totalTokens: 0,
      totalCostCents: 0,
      totalMessages: 0,
      apiRequests: 0,
    },
    exceeded: flags,
    isAnyLimitExceeded: Object.values(flags).some(Boolean),
  };
}

describe('assertWithinUsageLimits', () => {
  it('passes when nothing is exceeded', () => {
    expect(() =>
      assertWithinUsageLimits(status(), { organizationId: 'org_1' }),
    ).not.toThrow();
  });

  it.each(['tokens', 'cost', 'messages'] as const)(
    'throws when the %s ceiling is exceeded',
    (dimension) => {
      expect(() =>
        assertWithinUsageLimits(status({ [dimension]: true }), {
          organizationId: 'org_1',
        }),
      ).toThrow(UsageLimitError);
    },
  );

  /**
   * The one that would be wrong to get right by accident: the API quota counts
   * only rows tagged `source = 'API'`, so it must not refuse someone typing in
   * the panel. `isAnyLimitExceeded` is true here and the guard still passes.
   */
  it('ignores the API request quota on a chat turn', () => {
    const overApiOnly = status({ apiRequests: true });
    expect(overApiOnly.isAnyLimitExceeded).toBe(true);
    expect(() =>
      assertWithinUsageLimits(overApiOnly, { organizationId: 'org_1' }),
    ).not.toThrow();
  });

  it('enforces the API quota when a caller asks for it', () => {
    expect(() =>
      assertWithinUsageLimits(status({ apiRequests: true }), {
        organizationId: 'org_1',
        dimensions: ['apiRequests'],
      }),
    ).toThrow(UsageLimitError);
  });

  it('carries every exceeded dimension, for the log and the panel', () => {
    try {
      assertWithinUsageLimits(status({ tokens: true, cost: true }), {
        organizationId: 'org_1',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageLimitError);
      expect((error as UsageLimitError).exceeded).toEqual(['tokens', 'cost']);
    }
  });

  /**
   * The client renders `t(code)` and ignores `message` once a code is present
   * (`getErrorMessage`), so the code is the whole user-facing contract.
   */
  it('carries the translatable code, not a hand-written sentence', () => {
    const error = new UsageLimitError(['cost']);
    expect(error.code).toBe('usage-limit-exceeded');
  });

  it('does not put the API quota in the chat dimensions', () => {
    expect(CHAT_USAGE_DIMENSIONS).not.toContain('apiRequests');
  });
});

describe('isUsageLimitRefusal', () => {
  it("recognises the application's own refusal", () => {
    expect(isUsageLimitRefusal(new UsageLimitError(['cost']))).toBe(true);
  });

  /**
   * The proxy gives no code, only wording. These two strings are the whole
   * signal, which is why they live in one place now rather than three.
   */
  it.each(['Budget has been exceeded', 'ExceededBudget'])(
    'recognises the proxy refusal containing %s',
    (marker) => {
      expect(
        isUsageLimitRefusal(new Error(`litellm: ${marker} for team x`)),
      ).toBe(true);
    },
  );

  it('accepts a non-Error thrown value', () => {
    expect(isUsageLimitRefusal('Budget has been exceeded')).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isUsageLimitRefusal(new Error('connection reset'))).toBe(false);
    expect(isUsageLimitRefusal(undefined)).toBe(false);
    expect(isUsageLimitRefusal(null)).toBe(false);
  });
});
