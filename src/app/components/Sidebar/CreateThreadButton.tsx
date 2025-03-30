'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MouseEventHandler, useCallback, useEffect, useState } from 'react';

import { Text, Button, SpinnerSVG } from '@ragenai/common-ui';
import { PencilSquareIcon } from '@heroicons/react/24/outline';

type Props = {
  isThreadLoading: boolean;
  handleThread: MouseEventHandler<HTMLButtonElement>;
};

export const CreateThreadButton = ({
  isThreadLoading,
  handleThread,
}: Props) => {
  const [lockThreadClick, setLockThreadClick] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('sidebar');

  useEffect(() => {
    setLockThreadClick(false);
  }, [pathname]);

  const handleClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    async (event) => {
      await setLockThreadClick(true);
      handleThread(event);
    },
    []
  );

  return (
    <Button
      isLink
      disabled={lockThreadClick}
      onClick={handleClick}
      className="relative ml-4 w-10/12 rounded-md dark:border-slate-600 border-slate-200 border-2 flex justify-center mb-4"
    >
      <PencilSquareIcon className="w-6 h-6 dark:text-gray-200" />
      <Text
        className="m-1 mt-1 dark:text-gray-100"
        color="gray-700"
        fontWeight="normal"
      >
        {t('create-new-thread')}
      </Text>
      {isThreadLoading && (
        <SpinnerSVG size="sm" className="absolute right-24 bottom-2.5" />
      )}
    </Button>
  );
};
