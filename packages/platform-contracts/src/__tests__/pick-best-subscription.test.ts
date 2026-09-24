import { describe, it, expect } from 'vitest';

import {
  pickBestSubscription,
  subscriptionGrantsPlanFeatures,
} from '../subscriptions/pick-best-subscription';

const date = (iso: string) => new Date(iso);

describe('pickBestSubscription', () => {
  it('returns null when no candidates', () => {
    expect(pickBestSubscription([])).toBeNull();
  });

  it('prefers active paid plan over newer trialing trial', () => {
    const best = pickBestSubscription([
      {
        plan: 'Ragen Business',
        status: 'active',
        periodStart: date('2026-05-15'),
      },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.plan).toBe('Ragen Business');
  });

  it('prefers trialing paid plan over generic trialing Trial', () => {
    const best = pickBestSubscription([
      {
        plan: 'Ragen Business',
        status: 'trialing',
        periodStart: date('2026-05-10'),
      },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.plan).toBe('Ragen Business');
  });

  it('breaks ties within tier by latest periodStart', () => {
    const best = pickBestSubscription([
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-15') },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.periodStart).toEqual(date('2026-05-20'));
  });

  it('returns canceled subscription only when nothing else exists', () => {
    expect(
      pickBestSubscription([
        {
          plan: 'Ragen Business',
          status: 'canceled',
          periodStart: date('2026-04-01'),
        },
      ])?.status,
    ).toBe('canceled');
  });

  it('handles null periodStart safely', () => {
    const best = pickBestSubscription([
      { plan: 'Trial', status: 'trialing', periodStart: null },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.periodStart).toEqual(date('2026-05-20'));
  });
});

describe('subscriptionGrantsPlanFeatures', () => {
  it.each([
    ['active', true],
    ['trialing', true],
    ['canceled', false],
    ['past_due', false],
  ])('%s → %s', (status, expected) => {
    expect(
      subscriptionGrantsPlanFeatures({
        plan: 'Ragen Business',
        status,
        periodStart: null,
      }),
    ).toBe(expected);
  });

  it('grants nothing without a subscription', () => {
    expect(subscriptionGrantsPlanFeatures(null)).toBe(false);
  });
});
