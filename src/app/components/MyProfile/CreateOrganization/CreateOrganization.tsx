'use client';

import { useEffect } from 'react';
import { dark, experimental__simple } from '@clerk/themes';
import { useTheme } from 'next-themes';
import { CreateOrganization } from '@clerk/nextjs';
import { useOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import { syncOrganizationAndProject } from './actions';

import { useRouter } from '@/i18n/routing';

export const CreateOrganizationComponent = () => {
  // const { errorToast, successToast } = statusToast();
  const { resolvedTheme } = useTheme();
  // const { organization } = useOrganization();
  // const { push } = useRouter();
  const t = useTranslations('create-organization');

  // useEffect(() => {
  //   const sync = async () => {
  //     if (organization) {
  //       successToast({ message: t('success') });
  //       const { success } = await syncOrganizationAndProject();
  //       if (success) {
  //         push('/my-profile/organization-profile');
  //       } else {
  //         // TODO: there was a problem with organization synchronization
  //         // in the future we can send this action to temporal to make sure create record
  //         errorToast({ message: t('sync-error') });
  //         push('/my-profile/organization-profile');
  //       }
  //     }
  //   };
  //   sync();
  // }, [organization]);

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
