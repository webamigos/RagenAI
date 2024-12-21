'use client';

import Image from 'next/image';
import { StripePlan } from '../types/plan';
import { Button } from '@ragenai/common-ui';

type Props = {
  plan: StripePlan;
  handleSubscribe: (planId: string) => void;
};

export const Plan = ({ plan, handleSubscribe }: Props) => {
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
          <Button onClick={() => handleSubscribe(plan.id)} className="mt-2">
            Subscribe
          </Button>
        </div>
      </div>
    </div>
  );
};
