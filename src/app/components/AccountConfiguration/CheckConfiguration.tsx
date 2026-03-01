'use client';

import { useAccountSetupStatus } from '@/app/hooks/useAccountConfigurationStatus';
import { toast } from 'sonner';
import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@ragenai/common-ui/Button';
import { Text } from '@ragenai/common-ui/Text';
import { useTranslations } from 'next-intl';
import { signOut } from '@/app/hooks/use-better-auth';

const REFETCH_INTERVAL = 1000;
const SETUP_COMPLETE_REDIRECT_PATH = '/';

export const CheckConfiguration = () => {
  const router = useRouter();

  const t = useTranslations('account-configuration');

  const [accountReady, setAccountReady] = useState(false);

  const onSuccessCallback = () => {
    setAccountReady(true);
    router.push(SETUP_COMPLETE_REDIRECT_PATH);
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
