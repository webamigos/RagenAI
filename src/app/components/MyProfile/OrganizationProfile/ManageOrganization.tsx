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
          elements: {
            cardBox: 'grid-cols-1 h-1/2 w-full shadow-none border-none',
            navbar: 'hidden',
            footer: 'hidden',
            pageScrollBox:
              'flex w-full flex-row bg-white dark:bg-zinc-900 border-none',
            scrollBox: 'bg-white dark:bg-zinc-900 border-none',
            navbarMobileMenuRow: 'hidden',
          },
        }}
      />
    </Card>
  );
};
