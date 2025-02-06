import { useTranslations } from 'next-intl';
import { FieldError, UseFormRegister } from 'react-hook-form';
import { Textarea } from '@ragenai/common-ui';
import clsx from 'clsx';

type Props = {
  disabled: boolean;
  error?: FieldError;
  isUserLogged: boolean;
  handleResponseType: () => void;
  register: UseFormRegister<{
    prompt: string;
  }>;
  onSend: () => void;
  setPromptValue: (text: string) => void;
  value: string;
  showVoiceInput?: boolean;
  isPending?: boolean;
};

export const AskQuestion = ({
  disabled,
  error,
  value,
  handleResponseType,
  setPromptValue,
  register,
  onSend,
  showVoiceInput,
  isPending = false,
}: Props) => {
  const t = useTranslations('form');

  return (
    <Textarea
      autoFocus={true}
      value={value}
      onSend={onSend}
      containerClassName={clsx(
        'w-full md:w-11/12 mt-3',
        isPending && 'opacity-50'
      )}
      className={clsx(
        'h-10 mt-6 lg:mt-0 lg:-mb-0.5',
        isPending && 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed'
      )}
      errorMessage={t('provide-at-least-10-characters')}
      error={error}
      disabled={disabled}
      {...register('prompt')}
      setValue={setPromptValue}
      placeholder={isPending ? t('processing') : t('enter-your-question')}
      handleResponseType={handleResponseType}
      showVoiceInput={showVoiceInput}
    />
  );
};
