'use client';

import { dark, experimental__simple } from '@clerk/themes';
import { UserProfile } from '@clerk/nextjs';
import { useTheme } from 'next-themes';

import { Card } from '@salesyy/common-ui/Card';

export const AccountDetails = () => {
  const { resolvedTheme } = useTheme();

  return (
    <Card className="min-w-max p-0" size="full">
      <UserProfile
        appearance={{
          baseTheme: resolvedTheme === 'dark' ? dark : experimental__simple,
          elements: {
            cardBox: 'h-full w-full shadow-none border-none font-sans',
            actionCard: 'dark:bg-secondary-dark',
            navbar: 'hidden',
            navbarMobileMenuRow: 'hidden',
            footer: 'hidden',
            pageScrollBox: 'bg-white dark:bg-secondary-dark border-none',
            scrollBox: 'bg-white dark:bg-secondary-dark border-none',
            activeDevice: 'h-30',
            profileSectionItemList__activeDevices: 'overflow-auto max-h-30',
          },
        }}
      />
    </Card>
  );
};
