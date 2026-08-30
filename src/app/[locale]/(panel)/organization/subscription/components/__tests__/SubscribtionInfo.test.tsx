import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SubscriptionPlanType } from '@/generated/prisma/browser';
import type { SubscriptionDetails } from '../../types';

vi.mock('../../actions', () => ({
  cancelSubscription: vi.fn(),
  activateInternalFreePlan: vi.fn(),
  getSubscriptionData: vi.fn(),
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { SubscriptionInfo } from '../SubscribtionInfo';

const messages = {
  subscription: {
    'status-values': {
      active: 'Aktywna',
      trialing: 'Okres próbny',
    },
    'period-start': 'Data aktywacji',
    'trial-ends': 'Koniec okresu próbnego',
    'current-period-ends': 'Data wygaśnięcia',
    'cancel-subscription': 'Anuluj subskrypcję',
    'show-available-plans': 'Pokaż dostępne plany',
    'activate-free-plan': 'Aktywuj plan free',
    'confirm-activate': 'Zrezygnuj z bieżącej subskrypcji',
    'cancel-activation': 'Anuluj',
    'cancel-subscription-confirmation':
      'Twoja subskrypcja została anulowana, nie zostanie automatycznie odnowiona',
    'keep-subscription': 'Nie, zachowaj subskrypcję',
    'confirm-cancel': 'Tak, anuluj subskrypcję',
  },
};

function wrap(subscription: SubscriptionDetails) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <SubscriptionInfo subscription={subscription} />
    </NextIntlClientProvider>,
  );
}

const baseSubscription: SubscriptionDetails = {
  id: 'sub_1',
  plan: 'Trial',
  referenceId: 'org_1',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: 'trialing',
  periodStart: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
  seats: 1,
  trialStart: null,
  trialEnd: null,
  subscriptionPlan: {
    id: 'plan_1',
    name: 'Trial',
    priceId: 'internal_trial',
    type: SubscriptionPlanType.INTERNAL,
    status: 'ACTIVE',
    limits: {},
  } as SubscriptionDetails['subscriptionPlan'],
};

describe('SubscriptionInfo', () => {
  it('shows a translated status label, not the raw Stripe/internal status string', () => {
    wrap(baseSubscription);

    expect(screen.getByText('Okres próbny')).toBeInTheDocument();
    expect(screen.queryByText('trialing')).not.toBeInTheDocument();
  });

  it('does not leak the raw internal plan-type enum next to the plan name', () => {
    wrap(baseSubscription);

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/STRIPE/)).not.toBeInTheDocument();
  });

  it('falls back to the raw status string for a status with no known translation', () => {
    wrap({ ...baseSubscription, status: 'past_due' });

    expect(screen.getByText('past_due')).toBeInTheDocument();
  });
});
