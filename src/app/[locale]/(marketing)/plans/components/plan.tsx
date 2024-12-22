'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import Image from 'next/image';
import { Button } from '@ragenai/common-ui';
import { createCheckoutSession } from '../actions/stripe';
import { logger } from '@/app/lib/utils/logger';
import { type StripePlan } from '../types/plan';

type Props = {
  plan: StripePlan;
};

export const Plan = ({ plan }: Props) => {
  const t = useTranslations('plans');
  const [isLoading, setIsLoading] = useState(false);

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
    <div key={plan.id}>
      <h3 className="text-lg font-bold">{plan.product.name}</h3>

      <div className="flex flex-row gap-2 mt-1">
        <Image
          src={plan.product.images[0]}
          alt={plan.product.name}
          className="rounded-md"
          width={100}
          height={100}
        />

        <div>
          <p className="text-sm text-gray-500">{plan.product.description}</p>
          <p className="text-sm text-gray-500">{plan.unit_amount}</p>
          <Button onClick={onSubscribe} className="mt-2" isLoading={isLoading}>
            {t('subscribe')}
          </Button>
        </div>
      </div>
    </div>
  );
};
