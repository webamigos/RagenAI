'use client';

import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { SubscriptionDetails } from '../types';
import { PlanType, SubscriptionStatus } from '@prisma/client';
import { Button, Link } from '@ragenai/common-ui';
import { cancelSubscription } from '../actions';
import { toast } from 'react-toastify';

type Props = {
  subscription: SubscriptionDetails;
};

export const SubscriptionInfo = ({
  subscription: {
    plan,
    status,
    trial_end,
    current_period_end,
    current_period_start,
    canceled_at,
    stripe_subscription_id,
  },
}: Props) => {
  const t = useTranslations('subscription');

  const handleCancelSubscription = async () => {
    const response = await cancelSubscription(stripe_subscription_id);
    if (response) {
      toast.success(t('cancel-subscription-success'));
    } else {
      toast.error(t('cancel-subscription-error'));
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div>
        <h2 className="text-sm font-medium text-gray-500">
          {t('current-plan')}
        </h2>
        <p className="mt-1 text-lg font-semibold">
          {plan.name} ({plan.type})
        </p>
      </div>
      <div>
        <h2 className="text-sm font-medium text-gray-500">{t('status')}</h2>
        <p className="mt-1 text-lg font-semibold capitalize">
          <span
            className={`${
              status === SubscriptionStatus.ACTIVE
                ? 'text-green-600'
                : 'text-red-600'
            }`}
          >
            {status}
          </span>
        </p>
      </div>
      <div>
        <h2 className="text-sm font-medium text-gray-500">
          {t('period-start')}
        </h2>
        <p className="mt-1 text-lg font-semibold">
          {format(current_period_start, 'dd.MM.yyyy')}
        </p>
      </div>
      {canceled_at && (
        <div>
          <h2 className="text-sm font-medium text-gray-500">
            {t('canceled-at')}
          </h2>
          <p className="mt-1 text-lg font-semibold">
            {format(canceled_at, 'dd.MM.yyyy')}
          </p>
          <p className="text-sm">{t('cancel-subscription-confirmation')}</p>
        </div>
      )}
      {trial_end && (
        <div>
          <h2 className="text-sm font-medium text-gray-500">
            {t('trial-ends')}
          </h2>
          <p className="mt-1 text-lg font-semibold">
            {format(trial_end, 'dd.MM.yyyy')}
          </p>
        </div>
      )}
      {current_period_end && (
        <div>
          <h2 className="text-sm font-medium text-gray-500">
            {t('current-period-ends')}
          </h2>
          <p className="mt-1 text-lg font-semibold">
            {format(current_period_end, 'dd.MM.yyyy')}
          </p>
        </div>
      )}

      <div className="flex gap-4 items-center">
        {/* Todo: add confirmation modal */}
        {plan.type === PlanType.STRIPE && !canceled_at && (
          <Button
            className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
            onClick={handleCancelSubscription}
          >
            {t('cancel-subscription')}
          </Button>
        )}

        {plan.type === PlanType.INTERNAL || canceled_at ? (
          <Link href="/plans">{t('show-available-plans')}</Link>
        ) : null}
      </div>
    </div>
  );
};
