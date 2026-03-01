import { getTranslations } from 'next-intl/server';
import { Link } from '@ragenai/common-ui/Link';
import {
  checkIfStripeSubscriptionIsActive,
  fetchAvailablePlans,
} from '../actions/plans';
import { Plan } from './plan';

export const SubscriptionPlans = async () => {
  const stripePlans = await fetchAvailablePlans();
  const stripeSubscriptionIsActive = await checkIfStripeSubscriptionIsActive();

  const t = await getTranslations('plans');

  return (
    <div className="mt-8">
      {stripeSubscriptionIsActive && (
        <div className="mb-4">
          <p className="text-orange-500">
            {t('already-active')} <br />
            {t('already-active-description')}
          </p>
          <Link href="/my-profile/subscription">{t('view-subscription')}</Link>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {stripePlans.map((plan) => (
          <Plan
            key={plan.id}
            plan={plan}
            displayOnly={stripeSubscriptionIsActive}
          />
        ))}
      </div>
    </div>
  );
};
