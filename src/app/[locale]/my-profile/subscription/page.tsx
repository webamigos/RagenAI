import { getSubscriptionData } from './actions';

import { SubscriptionInfo } from './components/SubscribtionInfo';

export default async function SubscriptionPage() {
  const subscription = await getSubscriptionData();

  if (!subscription) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Organization Subscription</h1>
        <div className="bg-white shadow rounded-lg p-6">
          <p>No subscription found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Organization Subscription</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <SubscriptionInfo subscription={subscription} />
      </div>
    </div>
  );
}
