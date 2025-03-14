import { useTranslations } from 'next-intl';
import { FieldError, UseFormRegister } from 'react-hook-form';

import { Textarea } from '@ragenai/common-ui';

type Props = {
  disabled: boolean;
  error?: FieldError;
  isUserLogged: boolean;
  handleResponseType?: () => void;
  register: UseFormRegister<{
    prompt: string;
  }>;
  onSend: () => void;
  setPromptValue: (text: string) => void;
  value: string;
};

export const AskQuestion = ({
  disabled,
  error,
  value,
  handleResponseType,
  setPromptValue,
  register,
  onSend,
  isUserLogged,
}: Props) => {
  const t = useTranslations('form');

  return (
    <Textarea
      autoFocus={true}
      value={value}
      onSend={onSend}
      containerClassName="w-full md:w-11/12 mt-3"
      className="h-10 mt-6 lg:mt-0 lg:-mb-0.5"
      errorMessage={error?.message}
      error={error}
      disabled={disabled}
      {...register('prompt')}
      setValue={setPromptValue}
      placeholder={t('enter-your-question')}
      handleResponseType={handleResponseType}
      showVoiceInput={isUserLogged}
    />
  );
};
