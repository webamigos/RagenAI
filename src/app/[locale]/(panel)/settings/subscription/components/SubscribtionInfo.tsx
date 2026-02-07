'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { SubscriptionDetails } from '../types';
import { PlanType, SubscriptionStatus } from '@/generated/prisma/client';
import { Button, Link } from '@ragenai/common-ui';
import {
  cancelSubscription,
  activateInternalFreePlan,
  getSubscriptionData,
} from '../actions';
import { toast } from 'react-toastify';
import { useRouter } from '@/i18n/routing';
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from '@ragenai/tui/description-list';

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
  const [showActivateConfirmation, setShowActivateConfirmation] =
    useState(false);
  const router = useRouter();

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
    router.refresh();
  };

  const handleActivateFreePlan = async () => {
    setIsLoading(true);
    try {
      await activateInternalFreePlan();
      const updatedSubscription = await getSubscriptionData();
      if (updatedSubscription) {
        setSubscription(updatedSubscription);
      }
      toast.success(t('activate-free-plan-success'));
    } catch (error) {
      toast.error(t('activate-free-plan-error'));
    }
    setIsLoading(false);
    setShowActivateConfirmation(false);
    router.refresh();
  };

  return (
    <DescriptionList>
      <DescriptionTerm>{t('current-plan')}</DescriptionTerm>
      <DescriptionDetails>
        {plan.name} ({plan.type})
      </DescriptionDetails>

      <DescriptionTerm>{t('status')}</DescriptionTerm>
      <DescriptionDetails>
        <span
          className={`${
            status === SubscriptionStatus.ACTIVE
              ? 'text-green-600'
              : 'text-red-600'
          }`}
        >
          {status}
        </span>
      </DescriptionDetails>

      <DescriptionTerm>{t('period-start')}</DescriptionTerm>
      <DescriptionDetails>
        {format(current_period_start, 'dd.MM.yyyy')}
      </DescriptionDetails>

      {canceled_at && (
        <>
          <DescriptionTerm>{t('canceled-at')}</DescriptionTerm>
          <DescriptionDetails>
            <p>{format(canceled_at, 'dd.MM.yyyy')}</p>
            <p className="text-sm">{t('cancel-subscription-confirmation')}</p>
          </DescriptionDetails>
        </>
      )}
      {trial_end && (
        <>
          <DescriptionTerm>{t('trial-ends')}</DescriptionTerm>
          <DescriptionDetails>
            {format(trial_end, 'dd.MM.yyyy')}
          </DescriptionDetails>
        </>
      )}
      {current_period_end && (
        <>
          <DescriptionTerm>{t('current-period-ends')}</DescriptionTerm>
          <DescriptionDetails>
            {format(current_period_end, 'dd.MM.yyyy')}
          </DescriptionDetails>
        </>
      )}

      <div className="mt-6 flex gap-4 items-center">
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
          <Link href="/settings/subscription/plans">
            {t('show-available-plans')}
          </Link>
        ) : null}
      </div>
      {canceled_at && (
        <>
          {!showActivateConfirmation ? (
            <Button
              onClick={() => setShowActivateConfirmation(true)}
              isLoading={isLoading}
            >
              {t('activate-free-plan')}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handleActivateFreePlan} isLoading={isLoading}>
                {t('confirm-activate')}
              </Button>
              <Button
                onClick={() => setShowActivateConfirmation(false)}
                disabled={isLoading}
              >
                {t('cancel-activation')}
              </Button>
            </div>
          )}
        </>
      )}
    </DescriptionList>
  );
};
