import { fetchAvailablePlans } from '../actions/plans';
import { Card } from '@ragenai/common-ui';
import { Plan } from './plan';
import { handleSubscribe } from '../actions/plans';

export const SubscriptionPlans = async () => {
  const stripePlans = await fetchAvailablePlans();

  return (
    <Card size="full" className="mb-5 mt-6">
      <div className="flex flex-col gap-4">
        {stripePlans.map((plan) => (
          <Plan key={plan.id} plan={plan} handleSubscribe={handleSubscribe} />
        ))}
      </div>
    </Card>
  );
};
