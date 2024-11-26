import { useTranslations } from 'next-intl';

import { XMarkIcon } from '@ragenai/common-ui/icons';
import { Button } from '@ragenai/common-ui/Button';

type Props = {
  handleCloseThread: (redirect: boolean) => void;
};

export const CloseThread = ({ handleCloseThread }: Props) => {
  const t = useTranslations('form');

  return (
    <Button
      className="p-1 bg-primary-blue-400 hover:bg-primary-blue-500"
      onClick={() => handleCloseThread(true)}
      aria-label="Close thread"
    >
      <XMarkIcon className="text-gray-600" />
    </Button>
  );
};
