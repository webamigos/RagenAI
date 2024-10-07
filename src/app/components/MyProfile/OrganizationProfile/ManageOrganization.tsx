'use client';

import { useTheme } from 'next-themes';
import { dark, experimental__simple } from '@clerk/themes';
import { OrganizationProfile } from '@clerk/nextjs';

export const ManageOrganization = () => {
  const { resolvedTheme } = useTheme();

  return (
    <OrganizationProfile
      appearance={{
        baseTheme: resolvedTheme === 'dark' ? dark : experimental__simple,
        elements: {
          cardBox: 'grid-cols-1 h-1/2 shadow-none border-none',
          navbar: 'hidden',
          footer: 'hidden',
          pageScrollBox: 'bg-white dark:bg-zinc-900 border-none',
          scrollBox: 'bg-white dark:bg-zinc-900 border-none',
        },
      }}
    />
  );
};
