import { useTranslations } from 'next-intl';
import { FieldError, UseFormRegister } from 'react-hook-form';

import { Textarea } from '@salesyy/common-ui';

type Props = {
  disabled: boolean;
  error?: FieldError;
  isUserLogged: boolean;
  register: UseFormRegister<{
    prompt: string;
  }>;
  onSend: () => void;
  value: string;
};

export const AskQuestion = ({
  disabled,
  error,
  value,
  register,
  onSend,
}: Props) => {
  const t = useTranslations('form');

  return (
    <Textarea
      value={value}
      onSend={onSend}
      containerClassName="w-9/12 mt-3 md:w-10/12"
      className="h-10 mb-4 mt-6 lg:mt-0 lg:-mb-0.5"
      errorMessage={t('provide-at-least-10-characters')}
      error={error}
      disabled={disabled}
      {...register('prompt')}
      placeholder={t('enter-your-question')}
    />
  );
};
