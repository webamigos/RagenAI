import { describe, expect, it } from 'vitest';

import { threadRetentionInputSchema } from '../thread-retention.types';

describe('threadRetentionInputSchema', () => {
  it.each([30, 90, 180, 365])('accepts the %i-day preset', (days) => {
    expect(
      threadRetentionInputSchema.safeParse({ threadRetentionDays: days })
        .success,
    ).toBe(true);
  });

  it('accepts null, which turns retention off', () => {
    expect(
      threadRetentionInputSchema.safeParse({ threadRetentionDays: null }),
    ).toEqual({ success: true, data: { threadRetentionDays: null } });
  });

  // A free number is how `3` instead of `30` deletes almost everything.
  it.each([0, 1, 3, 7, 29, 31, 60, 364, 366, -30, 30.5, Number.NaN])(
    'refuses %s days, which is not a preset',
    (days) => {
      expect(
        threadRetentionInputSchema.safeParse({ threadRetentionDays: days })
          .success,
      ).toBe(false);
    },
  );

  it.each([
    ['a string', { threadRetentionDays: '30' }],
    ['a missing period', {}],
    ['undefined', { threadRetentionDays: undefined }],
    ['nothing at all', undefined],
  ])('refuses %s', (_label, input) => {
    expect(threadRetentionInputSchema.safeParse(input).success).toBe(false);
  });

  // The organization comes from the session. An input that tries to name
  // one is refused outright rather than having the field quietly dropped.
  it('refuses an organization id in the input', () => {
    expect(
      threadRetentionInputSchema.safeParse({
        threadRetentionDays: 30,
        organizationId: 'org-other',
      }).success,
    ).toBe(false);
  });
});
