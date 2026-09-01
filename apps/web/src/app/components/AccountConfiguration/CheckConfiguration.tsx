'use client';

import { useAccountSetupStatus } from '@/app/hooks/useAccountConfigurationStatus';
import { toast } from 'sonner';
import { useState } from 'react';
import { Button } from '@ragenai/common-ui/Button';
import { Text } from '@ragenai/common-ui/Text';
import { useTranslations, useLocale } from 'next-intl';
import { signOut } from '@/app/hooks/use-better-auth';

const REFETCH_INTERVAL = 1000;

export const CheckConfiguration = () => {
  const t = useTranslations('account-configuration');
  const locale = useLocale();

  const [accountReady, setAccountReady] = useState(false);

  const onSuccessCallback = () => {
    setAccountReady(true);
    // Full page reload to pick up the updated session cookie
    window.location.href = `/${locale}/`;
  };

  const onErrorCallback = () => {
    setAccountReady(false);
    toast.error(t('error-toast'));
  };

  const { handleTryAgain, isError } = useAccountSetupStatus({
    refetchInterval: REFETCH_INTERVAL,
    onSuccessCallback,
    onErrorCallback,
  });

  if (isError) {
    return (
      <div className="flex flex-col gap-4 items-start">
        <Text>{t('error')}</Text>
        <Text>{t('error-description')}</Text>
        <div className="flex gap-2">
          <Button onClick={handleTryAgain}>{t('try-again')}</Button>
          <Button onClick={() => signOut()}>{t('sign-out')}</Button>
        </div>
      </div>
    );
  }

  if (accountReady) {
    return <Text>{t('complete')}</Text>;
  }

  return <Text>{t('in-progress')}</Text>;
};
