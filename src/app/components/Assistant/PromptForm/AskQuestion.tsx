import { useTranslations } from 'next-intl';
import { FieldError, UseFormRegister } from 'react-hook-form';

import { Textarea } from '@ragenai/common-ui/Textarea';
import { ThreadDocumentUI } from '@/app/contracts/ThreadDocument';

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
  showFileAttachment?: boolean;
  onFilesDrop?: (files: File[]) => void;
  threadDocuments?: ThreadDocumentUI[];
  onThreadDocumentRemove?: (index: number) => void;
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
  showFileAttachment,
  onFilesDrop,
  threadDocuments,
  onThreadDocumentRemove,
}: Props) => {
  const t = useTranslations('form');

  return (
    <Textarea
      autoFocus={true}
      value={value}
      onSend={onSend}
      containerClassName="w-full"
      className="h-10 !rounded-xl !border-border/60 !shadow-md focus:!shadow-lg focus:!border-ring/40 transition-shadow dark:!bg-background"
      errorMessage={error?.message}
      error={error}
      disabled={disabled}
      {...register('prompt')}
      setValue={setPromptValue}
      placeholder={t('enter-your-question')}
      handleResponseType={handleResponseType}
      showVoiceInput={isUserLogged}
      showFileAttachment={showFileAttachment}
      onFilesDrop={onFilesDrop}
      threadDocuments={threadDocuments}
      onThreadDocumentRemove={onThreadDocumentRemove}
    />
  );
};
