import { useTranslations } from 'next-intl';
import { type FieldError, type UseFormRegister } from 'react-hook-form';

import { Textarea } from '@ragenai/common-ui/Textarea';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';

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
  textareaClassName?: string;
  leftAddon?: React.ReactNode;
};

export const AskQuestion = ({
  disabled,
  error,
  value,
  handleResponseType,
  setPromptValue,
  register,
  onSend,
  isUserLogged: _isUserLogged,
  showFileAttachment,
  onFilesDrop,
  threadDocuments,
  onThreadDocumentRemove,
  textareaClassName,
  leftAddon,
}: Props) => {
  const t = useTranslations('form');

  return (
    <Textarea
      autoFocus={true}
      value={value}
      onSend={onSend}
      containerClassName="w-full"
      className={textareaClassName || ''}
      errorMessage={error?.message}
      error={error}
      disabled={disabled}
      {...register('prompt')}
      setValue={setPromptValue}
      placeholder={t('enter-your-question')}
      handleResponseType={handleResponseType}
      showVoiceInput={false}
      showFileAttachment={showFileAttachment}
      onFilesDrop={onFilesDrop}
      threadDocuments={threadDocuments}
      onThreadDocumentRemove={onThreadDocumentRemove}
      leftAddon={leftAddon}
    />
  );
};
