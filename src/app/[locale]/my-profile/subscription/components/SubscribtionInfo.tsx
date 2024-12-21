import { format } from 'date-fns';
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
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-gray-500">Current Plan</h2>
        <p className="mt-1 text-lg font-semibold">
          {plan.name} ({plan.type})
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-500">Status</h2>
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
        <h2 className="text-sm font-medium text-gray-500">Period Start</h2>
        <p className="mt-1 text-lg font-semibold">
          {format(current_period_start, 'dd.MM.yyyy')}
        </p>
      </div>

      {canceled_at && (
        <div>
          <h2 className="text-sm font-medium text-gray-500">Canceled On</h2>
          <p className="mt-1 text-lg font-semibold">
            {format(canceled_at, 'dd.MM.yyyy')}
          </p>
        </div>
      )}

      {trial_end && (
        <div>
          <h2 className="text-sm font-medium text-gray-500">Trial Ends</h2>
          <p className="mt-1 text-lg font-semibold">
            {format(trial_end, 'dd.MM.yyyy')}
          </p>
        </div>
      )}

      {current_period_end && (
        <div>
          <h2 className="text-sm font-medium text-gray-500">
            Current Period Ends
          </h2>
          <p className="mt-1 text-lg font-semibold">
            {format(current_period_end, 'dd.MM.yyyy')}
          </p>
        </div>
      )}
    </div>
  );
};
