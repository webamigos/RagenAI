'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Image from 'next/image';
import { Button } from '@ragenai/common-ui';
import { createCheckoutSession } from '../actions/stripe';
import { logger } from '@/app/lib/utils/logger';
import { StripePlan } from '@/app/lib/services/stripe';

type Props = {
  plan: StripePlan;
  displayOnly?: boolean;
};

export const Plan = ({ plan, displayOnly }: Props) => {
  const t = useTranslations('plans');
  const [isLoading, setIsLoading] = useState(false);
  const locale = useLocale();

  const currency = plan.currency;
  const price = plan.unit_amount;
  const recurringInterval = plan.recurring?.interval;

  const formatPrice = (amount: number | null) => {
    if (!amount) return '0';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };

  const getIntervalText = () => {
    switch (recurringInterval) {
      case 'month':
        return t('per-month');
      case 'year':
        return t('per-year');
      default:
        return '';
    }
  };

  const onSubscribe = async () => {
    if (isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      const checkout = await createCheckoutSession(plan.id);

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
        <div className="flex items-center space-x-4">
          <Image
            src={plan.product.images[0]}
            alt={plan.product.name}
            className="h-16 w-16 rounded-md object-cover"
            width={64}
            height={64}
          />
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {plan.product.name}
            </h3>
            <p className="text-lg font-medium text-primary dark:text-primary-400">
              {formatPrice(price)}{' '}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {getIntervalText()}
              </span>
            </p>
          </div>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-300">
          {plan.product.description}
        </div>

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
