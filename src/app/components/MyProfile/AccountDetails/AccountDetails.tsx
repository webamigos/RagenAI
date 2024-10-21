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
            navbar: 'hidden',
            navbarMobileMenuRow: 'hidden',
            footer: 'hidden',
            pageScrollBox: 'bg-white dark:bg-zinc-900 border-none',
            scrollBox: 'bg-white dark:bg-zinc-900 border-none',
          },
        }}
      />
    </Card>
  );
};
