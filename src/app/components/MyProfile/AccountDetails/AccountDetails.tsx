'use client';

import { dark, experimental__simple } from '@clerk/themes';
import { UserProfile } from '@clerk/nextjs';
import { useTheme } from 'next-themes';

export const AccountDetails = () => {
  const { resolvedTheme } = useTheme();

  return (
    <UserProfile
      appearance={{
        baseTheme: resolvedTheme === 'dark' ? dark : experimental__simple,
        elements: {
          cardBox: 'h-1/2 shadow-none border-none',
          navbar: 'hidden',
          navbarMobileMenuRow: 'hidden',
          footer: 'hidden',
          pageScrollBox: 'bg-white dark:bg-zinc-900 border-none',
          scrollBox: 'bg-white dark:bg-zinc-900 border-none',
        },
      }}
    />
  );
};
