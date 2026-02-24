'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { SubscriptionDetails } from '../types';
import { SubscriptionPlanType } from '@/generated/prisma/client';
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
    subscriptionPlan,
    status,
    trialEnd,
    periodEnd,
    periodStart,
    cancelAtPeriodEnd,
    stripeSubscriptionId,
  } = subscription;

  const planType = subscriptionPlan?.type;
  const isStripe = planType === SubscriptionPlanType.STRIPE;

  const handleCancelSubscription = async () => {
    setIsLoading(true);
    const response = await cancelSubscription(stripeSubscriptionId);
    if (response) {
      toast.success(t('cancel-subscription-success'));
      setSubscription((prev) => ({
        ...prev,
        cancelAtPeriodEnd: true,
      }));
    } else {
      setSubscription((prev) => ({
        ...prev,
        cancelAtPeriodEnd: initialSubscription.cancelAtPeriodEnd,
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
        {plan} {planType ? `(${planType})` : ''}
      </DescriptionDetails>

      <DescriptionTerm>{t('status')}</DescriptionTerm>
      <DescriptionDetails>
        <span
          className={`${
            status === 'active' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {status}
        </span>
      </DescriptionDetails>

      {periodStart && (
        <>
          <DescriptionTerm>{t('period-start')}</DescriptionTerm>
          <DescriptionDetails>
            {format(periodStart, 'dd.MM.yyyy')}
          </DescriptionDetails>
        </>
      )}

      {cancelAtPeriodEnd && (
        <>
          <DescriptionTerm>{t('canceled-at')}</DescriptionTerm>
          <DescriptionDetails>
            <p>{t('cancel-subscription-confirmation')}</p>
          </DescriptionDetails>
        </>
      )}
      {trialEnd && (
        <>
          <DescriptionTerm>{t('trial-ends')}</DescriptionTerm>
          <DescriptionDetails>
            {format(trialEnd, 'dd.MM.yyyy')}
          </DescriptionDetails>
        </>
      )}
      {periodEnd && (
        <>
          <DescriptionTerm>{t('current-period-ends')}</DescriptionTerm>
          <DescriptionDetails>
            {format(periodEnd, 'dd.MM.yyyy')}
          </DescriptionDetails>
        </>
      )}

      <div className="mt-6 flex gap-4 items-center">
        {isStripe && !cancelAtPeriodEnd && (
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

        {!isStripe || cancelAtPeriodEnd ? (
          <Link href="/settings/subscription/plans">
            {t('show-available-plans')}
          </Link>
        ) : null}
      </div>
      {cancelAtPeriodEnd && (
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
