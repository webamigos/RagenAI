'use client';

import { useTheme } from 'next-themes';
import { dark, experimental__simple } from '@clerk/themes';
import { OrganizationProfile } from '@clerk/nextjs';
import { Card } from '@ragenai/common-ui/Card';

export const ManageOrganization = () => {
  const { resolvedTheme } = useTheme();

  return (
    <Card className="w-full p-0" size="full">
      <div className="w-full overflow-x-auto">
        <OrganizationProfile
          afterLeaveOrganizationUrl="/my-profile"
          appearance={{
            baseTheme: resolvedTheme === 'dark' ? dark : experimental__simple,
            variables: {
              colorBackground: resolvedTheme === 'dark' ? '#253745' : '',
              colorInputBackground: resolvedTheme === 'dark' ? '#253745' : '',
              colorText: resolvedTheme === 'dark' ? '#e5e7eb' : '',
            },
            elements: {
              cardBox: 'grid-cols-1 h-1/2 w-full shadow-none border-none',
              rootBox: 'w-full',
              actionCard: 'dark:bg-secondary-dark',
              navbar: 'hidden',
              footer: 'hidden',
              pageScrollBox:
                'flex w-full flex-col bg-white dark:bg-secondary-dark border-none',
              scrollBox:
                'flex w-full bg-white dark:bg-secondary-dark border-none',
              navbarMobileMenuRow: 'hidden',
              table: 'w-full !important!',
            },
          }}
        />
      </div>
    </Card>
  );
};
