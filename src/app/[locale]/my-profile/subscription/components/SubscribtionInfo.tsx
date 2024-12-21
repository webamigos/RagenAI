import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { SubscriptionDetails } from '../types';
import { SubscriptionStatus } from '@prisma/client';

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
  },
}: Props) => {
  const t = useTranslations('subscription');
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
    </div>
  );
};
