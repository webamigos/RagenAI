'use client';

import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { SubscriptionDetails } from '../types';
import { PlanType, SubscriptionStatus } from '@prisma/client';
import { Button, Link } from '@ragenai/common-ui';
import { cancelSubscription } from '../actions';
import { toast } from 'react-toastify';
import { useState } from 'react';

type Props = {
  subscription: SubscriptionDetails;
};

export const SubscriptionInfo = ({
  subscription: initialSubscription,
}: Props) => {
  const t = useTranslations('subscription');
  const [subscription, setSubscription] = useState(initialSubscription);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const {
    plan,
    status,
    trial_end,
    current_period_end,
    current_period_start,
    canceled_at,
    stripe_subscription_id,
  } = subscription;

  const handleCancelSubscription = async () => {
    setIsLoading(true);
    const response = await cancelSubscription(stripe_subscription_id);
    if (response) {
      const canceledAt = response.canceled_at;
      toast.success(t('cancel-subscription-success'));
      setSubscription((prev) => ({
        ...prev,
        canceled_at: canceledAt ? new Date(canceledAt * 1000) : new Date(),
      }));
    } else {
      setSubscription((prev) => ({
        ...prev,
        canceled_at: initialSubscription.canceled_at,
        status: initialSubscription.status,
      }));
      toast.error(t('cancel-subscription-error'));
    }
    setIsLoading(false);
    setShowConfirmation(false);
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
        {plan.type === PlanType.STRIPE && !canceled_at && (
          <>
            {!showConfirmation ? (
              <Button
                className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                onClick={() => setShowConfirmation(true)}
              >
                {t('cancel-subscription')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  onClick={handleCancelSubscription}
                  isLoading={isLoading}
                >
                  {t('confirm-cancel')}
                </Button>
                <Button
                  onClick={() => setShowConfirmation(false)}
                  disabled={isLoading}
                >
                  {t('keep-subscription')}
                </Button>
              </div>
            )}
          </>
        )}

        {plan.type === PlanType.INTERNAL || canceled_at ? (
          <Link href="/plans">{t('show-available-plans')}</Link>
        ) : null}
      </div>
    </div>
  );
};
