'use client';

import { dark, experimental__simple } from '@clerk/themes';
import { UserProfile } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export const AccountDetails = () => {
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    setIsDarkMode(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return (
    <UserProfile
      appearance={{
        baseTheme: isDarkMode ? dark : experimental__simple,
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
