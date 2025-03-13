'use client';

import { useClerk, useOrganization } from '@clerk/nextjs';
import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AccountConfigurationResponse,
  checkUserAccountConfiguration,
} from './actions';

export default function AccountConfigurationPage() {
  const router = useRouter();
  const { isLoaded: isOrgLoaded, organization } = useOrganization();
  const [accountConfigurationStatus, setAccountConfigurationStatus] =
    useState<AccountConfigurationResponse | null>(null);

  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const clerk = useClerk();

  // Check if organization exists in Clerk
  const hasClerkOrganization = isOrgLoaded && !!organization;

  useEffect(() => {
    const checkForOrganization = async () => {
      try {
        const status = await checkUserAccountConfiguration();
        setAccountConfigurationStatus(status);
        setInitialCheckDone(true);

        if (status.accountSetupComplete) {
          await clerk.setActive({ organization: status.organizationId });
          router.refresh();
          return true;
        }

        return false;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error checking for organization:', error);
        return false;
      }
    };

    const pollForOrganization = () => {
      let timeoutId: NodeJS.Timeout;

      const poll = async () => {
        const hasOrg = await checkForOrganization();

        if (!hasOrg) {
          timeoutId = setTimeout(poll, 1000);
        } else {
          router.refresh();
          router.push('/');
        }
      };

      poll();

      return () => clearTimeout(timeoutId);
    };

    pollForOrganization();
  }, [clerk, hasClerkOrganization, router]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Account setup</h1>

      {initialCheckDone ? (
        <div className="mt-4">
          <h2 className="text-lg font-bold mb-2">
            Account configuration status:{' '}
            {accountConfigurationStatus?.accountSetupComplete
              ? 'Complete'
              : 'Incomplete'}
          </h2>
          <p>
            Has organization:{' '}
            {accountConfigurationStatus?.clerkOrganizationExists ? 'Yes' : 'No'}
          </p>
          <p>
            Organization db entry exists:{' '}
            {accountConfigurationStatus?.internalOrganizationExists
              ? 'Yes'
              : 'No'}
          </p>
          <p>
            Has subscription:{' '}
            {accountConfigurationStatus?.organizationHasSubscription
              ? 'Yes'
              : 'No'}
          </p>
          <p>
            Has default project:{' '}
            {accountConfigurationStatus?.organizationHasDefaultProject
              ? 'Yes'
              : 'No'}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p>Checking for organization...</p>
          <SpinnerSVG size="sm" />
        </div>
      )}

      <div className="mt-4">
        <p>Your account is being configured...</p>
        <p className="mt-2 text-sm text-gray-500">
          We&apos;re setting up your organization. This may take a moment.
        </p>
      </div>
    </div>
  );
}
