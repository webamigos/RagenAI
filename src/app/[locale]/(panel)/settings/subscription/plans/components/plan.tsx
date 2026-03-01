'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@ragenai/common-ui/Button';
import { createCheckoutSession } from '../actions/stripe';
import { logger } from '@/app/lib/utils/logger';
import type { SubscriptionPlan } from '@/generated/prisma/browser';

type Props = {
  plan: SubscriptionPlan;
  displayOnly?: boolean;
};

export const Plan = ({ plan, displayOnly }: Props) => {
  const t = useTranslations('plans');
  const [isLoading, setIsLoading] = useState(false);

  const limits = plan.limits as Record<string, number> | null;
  const metadata = plan.metadata as Record<string, string> | null;

  const onSubscribe = async () => {
    if (isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      const checkout = await createCheckoutSession(plan.priceId);

      if (!checkout) {
        throw new Error('No checkout session returned');
      }

      if (checkout.url) {
        window.location.assign(checkout.url);
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      logger.error('Checkout error:', error);
      toast.error(t('checkout-error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      key={plan.id}
      className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 p-6"
    >
      <div className="flex flex-col space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {plan.name}
          </h3>
          {metadata?.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {metadata.description}
            </p>
          )}
        </div>

        {limits && Object.keys(limits).length > 0 && (
          <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
            {Object.entries(limits).map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-center sm:justify-start">
          <Button
            disabled={displayOnly}
            onClick={onSubscribe}
            isLoading={isLoading}
          >
            {t('subscribe')}
          </Button>
        </div>
      </div>
    </div>
  );
};
