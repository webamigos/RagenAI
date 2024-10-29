'use client';

import { useTheme } from 'next-themes';
import { dark, experimental__simple } from '@clerk/themes';
import { OrganizationProfile } from '@clerk/nextjs';
import { Card } from '@salesyy/common-ui/Card';

export const ManageOrganization = () => {
  const { resolvedTheme } = useTheme();

  return (
    <Card className="min-w-max p-0" size="full">
      <OrganizationProfile
        appearance={{
          baseTheme: resolvedTheme === 'dark' ? dark : experimental__simple,
          variables: {
            colorBackground: resolvedTheme === 'dark' ? '#253745' : '',
            colorInputBackground: resolvedTheme === 'dark' ? '#253745' : '',
            colorText: resolvedTheme === 'dark' ? '#e5e7eb' : '',
          },
          elements: {
            cardBox: 'grid-cols-1 h-1/2 w-full shadow-none border-none',
            actionCard: 'dark:bg-secondary-dark',
            navbar: 'hidden',
            footer: 'hidden',
            pageScrollBox:
              'flex w-full flex-row bg-white dark:bg-secondary-dark border-none',
            scrollBox: 'bg-white dark:bg-secondary-dark border-none',
            navbarMobileMenuRow: 'hidden',
          },
        }}
      />
    </Card>
  );
};
