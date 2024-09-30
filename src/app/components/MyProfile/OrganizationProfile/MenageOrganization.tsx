'use client';

import { OrganizationProfile } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { dark, experimental__simple } from '@clerk/themes';

export const MenageOrganization = () => {
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    setIsDarkMode(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return (
    <OrganizationProfile
      appearance={{
        baseTheme: isDarkMode ? dark : experimental__simple,
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
