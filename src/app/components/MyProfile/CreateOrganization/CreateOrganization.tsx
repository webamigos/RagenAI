'use client';
import { dark, experimental__simple } from '@clerk/themes';
import { useTheme } from 'next-themes';

import { CreateOrganization } from '@clerk/nextjs';

export const CreateOrganizationComponent = () => {
  const { resolvedTheme } = useTheme();

  return (
    <CreateOrganization
      appearance={{
        baseTheme: resolvedTheme === 'dark' ? dark : experimental__simple,
        elements: {
          cardBox: 'h-1/2 shadow-none border-none',
          footer: 'hidden',
        },
      }}
    />
  );
};
