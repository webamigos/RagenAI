'use client';

import { useEffect } from 'react';
import { dark, experimental__simple } from '@clerk/themes';
import { useTheme } from 'next-themes';
import { CreateOrganization } from '@clerk/nextjs';
import { useOrganization } from '@clerk/nextjs';

import { useRouter } from '@/i18n/routing';

export const CreateOrganizationComponent = () => {
  const { resolvedTheme } = useTheme();
  const { organization } = useOrganization();
  const { push } = useRouter();

  useEffect(() => {
    if (organization) {
      push('/');
    }
  }, [organization]);

  return (
    <CreateOrganization
      appearance={{
        baseTheme: resolvedTheme === 'dark' ? dark : experimental__simple,
        variables: {
          colorBackground: resolvedTheme === 'dark' ? '#253745' : '',
          colorInputBackground: resolvedTheme === 'dark' ? '#253745' : '',
          colorText: resolvedTheme === 'dark' ? '#e5e7eb' : '',
        },
        elements: {
          formFieldLabelRow: 'organization-name',
          cardBox: 'h-1/2 w-full shadow-none border-none',
          rootBox: 'w-full',
          footer: 'hidden',
          formButtonPrimary: 'create-organization-button',
        },
      }}
    />
  );
};
