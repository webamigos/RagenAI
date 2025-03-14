'use client';

import { CheckError } from './CheckStages/CheckError';
import { ReadyToRedirect } from './CheckStages/ReadyToRedirect';
import { InProgress } from './CheckStages/InProgress';
import { useAccountSetupStatus } from '@/app/hooks/useAccountConfigurationStatus';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';
const REFETCH_INTERVAL = 1000;
const SETUP_COMPLETE_REDIRECT_PATH = '/';

export const AccountConfiguration = () => {
  const router = useRouter();

  const onSuccessCallback = () => {
    router.push(SETUP_COMPLETE_REDIRECT_PATH);
  };

  const onErrorCallback = () => {
    toast.error('An error occurred while setting up your account');
  };

  const { handleTryAgain, isError, status } = useAccountSetupStatus({
    refetchInterval: REFETCH_INTERVAL,
    onSuccessCallback,
    onErrorCallback,
  });

  if (isError) {
    return <CheckError tryAgainHandler={handleTryAgain} />;
  }

  if (status?.accountSetupComplete) {
    return <ReadyToRedirect />;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Account setup</h1>
      <InProgress />
    </div>
  );
};
