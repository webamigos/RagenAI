import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

interface SubscriptionData {
  plan: {
    name: string;
    type: string;
  };
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_end: string;
}

export default async function SubscriptionPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Get user's active organization
  const organizations = await clerkClient.users.getOrganizationMembershipList({
    userId: user.id,
  });
  const activeOrg = organizations.data[0];

  if (!activeOrg) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">No Organization Found</h1>
        <p>
          You need to be part of an organization to view subscription details.
        </p>
      </div>
    );
  }

  const org = await clerkClient.organizations.getOrganization({
    organizationId: activeOrg.organization.id,
  });

  const subscriptionData: SubscriptionData = (org.privateMetadata as any)
    ?.subscription || {
    plan: { name: 'No active plan', type: 'none' },
    status: 'inactive',
    current_period_start: '',
    current_period_end: '',
    trial_end: '',
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Organization Subscription</h1>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-gray-500">Current Plan</h2>
            <p className="mt-1 text-lg font-semibold">
              {subscriptionData.plan.name} ({subscriptionData.plan.type})
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-500">Status</h2>
            <p className="mt-1 text-lg font-semibold capitalize">
              <span
                className={`${
                  subscriptionData.status === 'ACTIVE'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {subscriptionData.status}
              </span>
            </p>
          </div>

          {subscriptionData.trial_end && (
            <div>
              <h2 className="text-sm font-medium text-gray-500">Trial Ends</h2>
              <p className="mt-1 text-lg font-semibold">
                {new Date(subscriptionData.trial_end).toLocaleDateString()}
              </p>
            </div>
          )}

          {subscriptionData.current_period_end && (
            <div>
              <h2 className="text-sm font-medium text-gray-500">
                Current Period Ends
              </h2>
              <p className="mt-1 text-lg font-semibold">
                {new Date(
                  subscriptionData.current_period_end
                ).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
