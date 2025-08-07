import { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitHandler, useForm } from 'react-hook-form';
import { validateTextFile } from '@/app/lib/utils/fileValidation';

import { zodResolver } from '@hookform/resolvers/zod';

import { AskQuestion } from './';
import {
  ChatType,
  type CreateMessageDto,
  ChatResponseType,
} from '../../../contracts/Message';
import { createMessageSchema } from '../../../contracts/Message';

// Thread-level document interface (temporary, będzie przeniesione do contracts)
interface ThreadDocument {
  name: string;
  content: string;
  size: number;
  type: string;
}

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  handleResponseType?: () => void;
  isPublicAccess?: boolean;
  onSubmit: SubmitHandler<CreateMessageDto>;
  responseType: ChatResponseType;
};

export type PromptFormRef = {
  reset: (prompt?: string) => void;
};

export const PromptForm = forwardRef<PromptFormRef, Props>(
  (
    {
      isLoading,
      isUserLogged,
      onSubmit,
      isPublicAccess,
      handleResponseType,
      responseType,
    },
    ref
  ) => {
    const t = useTranslations('form');
    const [threadDocuments, setThreadDocuments] = useState<ThreadDocument[]>(
      []
    );

    const {
      register,
      reset,
      handleSubmit,
      formState: { errors },
      watch,
      setValue,
    } = useForm<CreateMessageDto>({
      resolver: zodResolver(createMessageSchema(t)),
      reValidateMode: 'onSubmit',
      defaultValues: {
        useKnowledge: true,
      },
    });

    useImperativeHandle(ref, () => ({
      reset: (prompt) => reset({ prompt }),
    }));

    // File handling
    const readFileAsText = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            resolve(event.target.result as string);
          } else {
            reject(new Error('Failed to read file content'));
          }
        };
        reader.onerror = () =>
          reject(new Error(`Failed to read file: ${file.name}`));
        reader.readAsText(file, 'UTF-8');
      });
    };

    const handleFilesDrop = useCallback(async (files: File[]) => {
      const validFiles: File[] = [];

      for (const file of files) {
        const validation = validateTextFile(file);
        if (validation.valid) {
          validFiles.push(file);
        } else {
          // TODO: Show error toast with validation.error
        }
      }

      // Read file contents
      const newDocuments: ThreadDocument[] = [];
      for (const file of validFiles) {
        try {
          const content = await readFileAsText(file);
          newDocuments.push({
            name: file.name,
            content: content.trim(),
            size: file.size,
            type: file.type || 'text/plain',
          });
        } catch (error) {
          // TODO: Show error toast for file read error
        }
      }

      setThreadDocuments((prev) => [...prev, ...newDocuments]);
    }, []);

    const handleThreadDocumentRemove = useCallback((index: number) => {
      setThreadDocuments((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleFormSubmit: SubmitHandler<CreateMessageDto> = async (data) => {
      reset({ prompt: '' });
      onSubmit({
        ...data,
        mode: data.useKnowledge ? ChatType.RAG : ChatType.CONVERSATION,
        messageType: responseType,
        voiceDurationSeconds: data.voiceDurationSeconds,
      });
    };

    const handleSend = () => {
      handleSubmit(handleFormSubmit)();
    };

    const promptValue = watch('prompt', '');
    const useKnowledge = watch('useKnowledge');

    return (
      <div className="px-5 bg-white dark:bg-zinc-900">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col w-full sm:w-11/12 lg:w-4/5 mx-auto justify-center"
        >
          <div className="flex w-full justify-center">
            <AskQuestion
              isUserLogged={isUserLogged}
              disabled={isLoading}
              error={errors?.prompt}
              register={register}
              onSend={handleSend}
              value={promptValue}
              handleResponseType={handleResponseType}
              setPromptValue={(text: string) => setValue('prompt', text)}
              showFileAttachment={true}
              onFilesDrop={handleFilesDrop}
              threadDocuments={threadDocuments}
              onThreadDocumentRemove={handleThreadDocumentRemove}
            />
          </div>
          {!isPublicAccess && (
            <div className="flex w-full justify-center">
              <label className="w-full md:w-11/12 mt-3 text-sm text-gray-400">
                <input
                  type="checkbox"
                  {...register('useKnowledge')}
                  className="mr-1"
                />
                {t('selected-mode')}
                {/* {useKnowledge ? t(ChatType.RAG) : t(ChatType.CONVERSATION)} */}
              </label>
            </div>
          )}
        </form>
      </div>
    );
  }
);

PromptForm.displayName = 'PromptForm';
