'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { SubscriptionDetails } from '../types';
import { SubscriptionPlanType } from '@/generated/prisma/browser';
import { Button } from '@ragenai/common-ui/Button';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogActions,
} from '@ragenai/common-ui/Dialog';
import {
  cancelSubscription,
  activateInternalFreePlan,
  getSubscriptionData,
} from '../actions';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Link } from '@/i18n/routing';

type Props = {
  subscription: SubscriptionDetails;
};

export const SubscriptionInfo = ({
  subscription: initialSubscription,
}: Props) => {
  const t = useTranslations('subscription');
  const [subscription, setSubscription] = useState(initialSubscription);
  const [isLoading, setIsLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
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
    setShowCancelDialog(false);
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
    } catch {
      toast.error(t('activate-free-plan-error'));
    }
    setIsLoading(false);
    setShowActivateDialog(false);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Plan details */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            {plan}
          </h2>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${(() => {
              if (status === 'active') {
                return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
              }
              if (status === 'trialing') {
                return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
              }
              return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            })()}`}
          >
            {t.has(`status-values.${status}`)
              ? t(`status-values.${status}` as 'status-values.active')
              : status}
          </span>
        </div>

        {cancelAtPeriodEnd && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('cancel-subscription-confirmation')}
            </p>
          </div>
        )}
      </div>

      {/* Date details */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {periodStart && (
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('period-start')}
            </span>
            <span className="text-sm font-medium text-zinc-950 dark:text-white">
              {format(periodStart, 'dd.MM.yyyy')}
            </span>
          </div>
        )}
        {trialEnd && (
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('trial-ends')}
            </span>
            <span className="text-sm font-medium text-zinc-950 dark:text-white">
              {format(trialEnd, 'dd.MM.yyyy')}
            </span>
          </div>
        )}
        {periodEnd && (
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('current-period-ends')}
            </span>
            <span className="text-sm font-medium text-zinc-950 dark:text-white">
              {format(periodEnd, 'dd.MM.yyyy')}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {isStripe && !cancelAtPeriodEnd && (
          <button
            onClick={() => setShowCancelDialog(true)}
            className="text-sm text-red-600 transition-colors hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
          >
            {t('cancel-subscription')}
          </button>
        )}

        {(!isStripe || cancelAtPeriodEnd) && (
          <Link
            href="/organization/subscription/plans"
            className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {t('show-available-plans')}
          </Link>
        )}

        {cancelAtPeriodEnd && (
          <Button onClick={() => setShowActivateDialog(true)}>
            {t('activate-free-plan')}
          </Button>
        )}
      </div>

      {/* Cancel subscription dialog */}
      <Dialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        size="sm"
      >
        <DialogTitle>{t('cancel-subscription')}</DialogTitle>
        <DialogDescription>
          {t('cancel-subscription-confirmation')}
        </DialogDescription>
        <DialogActions>
          <Button
            outline
            onClick={() => setShowCancelDialog(false)}
            disabled={isLoading}
          >
            {t('keep-subscription')}
          </Button>
          <Button
            onClick={handleCancelSubscription}
            isLoading={isLoading}
            className="!bg-red-600 hover:!bg-red-700 !border-red-600"
          >
            {t('confirm-cancel')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Activate free plan dialog */}
      <Dialog
        open={showActivateDialog}
        onClose={() => setShowActivateDialog(false)}
        size="sm"
      >
        <DialogTitle>{t('activate-free-plan')}</DialogTitle>
        <DialogDescription>{t('confirm-activate')}</DialogDescription>
        <DialogActions>
          <Button
            outline
            onClick={() => setShowActivateDialog(false)}
            disabled={isLoading}
          >
            {t('cancel-activation')}
          </Button>
          <Button onClick={handleActivateFreePlan} isLoading={isLoading}>
            {t('activate-free-plan')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
