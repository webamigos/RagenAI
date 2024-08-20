import { useTranslations } from 'next-intl';
import { FieldError, UseFormRegister } from 'react-hook-form';

import { Input } from '@salesyy/common-ui';

type Props = {
  disabled: boolean;
  error?: FieldError;
  register: UseFormRegister<{
    prompt: string;
  }>;
};
export const AskQuestion = ({ disabled, error, register }: Props) => {
  const t = useTranslations('form');

  return (
    <Input
      label=""
      placeholder={t('enter-your-question')}
      {...register('prompt')}
      disabled={disabled}
      error={error}
      errorMessage={t('provide-at-least-10-characters')}
      className="h-10"
      containerClassName="w-9/12 md:w-10/12"
    />
  );
};
