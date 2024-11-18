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
