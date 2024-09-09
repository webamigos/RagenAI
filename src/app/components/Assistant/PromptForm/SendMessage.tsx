import { useTranslations } from 'next-intl';

import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Button } from '@salesyy/common-ui';

type Props = {
  disabled: boolean;
};

export const SendMessage = ({ disabled }: Props) => {
  const t = useTranslations('form');

  return (
    <Button
      type="submit"
      label={t('send')}
      iconRight={
        <PaperAirplaneIcon
          className="h-5 w-5 flex-none text-white cursor-pointer"
          aria-hidden="true"
        />
      }
      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400"
      disabled={disabled}
    />
  );
};
