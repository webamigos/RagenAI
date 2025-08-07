import { useTranslations } from 'next-intl';
import { FieldError, UseFormRegister } from 'react-hook-form';

import { Textarea } from '@ragenai/common-ui';

// Thread-level document interface (temporary, będzie przeniesione do contracts)
interface ThreadDocument {
  name: string;
  content: string;
  size: number;
  type: string;
}

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
  threadDocuments?: ThreadDocument[];
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
      containerClassName="w-full mt-3"
      className="h-10 lg:mt-0 lg:-mb-0.5"
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
