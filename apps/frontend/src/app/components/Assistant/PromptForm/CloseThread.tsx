import { useTranslations } from 'next-intl';
import { MouseEventHandler } from 'react';

import { ArchiveBoxIcon } from '@heroicons/react/24/outline';

type Props = {
  handleCloseThread: MouseEventHandler<HTMLButtonElement>;
};

export const CloseThread = ({ handleCloseThread }: Props) => {
  const t = useTranslations('form');

  return (
    <span
      className="flex items-center cursor-pointer mr-4"
      onClick={handleCloseThread}
    >
      <ArchiveBoxIcon
        className="h-5 w-5 flex-none mr-2  cursor-pointer"
        aria-hidden="true"
      />
      {t('close-thread')}
    </span>
  );
};
