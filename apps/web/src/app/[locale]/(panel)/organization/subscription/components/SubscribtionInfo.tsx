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
          <h2 className="text-base font-semibold text-foreground">{plan}</h2>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${(() => {
              if (status === 'active') {
                return 'bg-ready-tint text-ready dark:bg-ready/30';
              }
              if (status === 'trialing') {
                return 'bg-pending-tint text-pending dark:bg-pending/30';
              }
              return 'bg-crimson-50 text-destructive dark:bg-crimson-950/30';
            })()}`}
          >
            {t.has(`status-values.${status}`)
              ? t(`status-values.${status}` as 'status-values.active')
              : status}
          </span>
        </div>

        {cancelAtPeriodEnd && (
          <div className="rounded-lg border border-pending/40 bg-pending-tint p-3 dark:bg-pending/30">
            <p className="text-sm text-pending">
              {t('cancel-subscription-confirmation')}
            </p>
          </div>
        )}
      </div>

      {/* Date details */}
      <div className="divide-y divide-border">
        {periodStart && (
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-muted-foreground">
              {t('period-start')}
            </span>
            <span className="text-sm font-medium text-foreground">
              {format(periodStart, 'dd.MM.yyyy')}
            </span>
          </div>
        )}
        {trialEnd && (
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-muted-foreground">
              {t('trial-ends')}
            </span>
            <span className="text-sm font-medium text-foreground">
              {format(trialEnd, 'dd.MM.yyyy')}
            </span>
          </div>
        )}
        {periodEnd && (
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-muted-foreground">
              {t('current-period-ends')}
            </span>
            <span className="text-sm font-medium text-foreground">
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
            className="text-sm text-destructive transition-colors hover:text-destructive/90"
          >
            {t('cancel-subscription')}
          </button>
        )}

        {(!isStripe || cancelAtPeriodEnd) && (
          <Link
            href="/organization/subscription/plans"
            className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
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
            className="!bg-destructive hover:!bg-destructive/90 !border-destructive"
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
