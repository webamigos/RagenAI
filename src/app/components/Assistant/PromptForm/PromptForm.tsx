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
  createMessageSchema,
} from '@/features/messages/contracts/message.types';
import { ThreadDocumentUI } from '@/features/documents/contracts/document.types';

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  handleResponseType?: () => void;
  isPublicAccess?: boolean;
  onSubmit: SubmitHandler<CreateMessageDto>;
  responseType: ChatResponseType;
  currentThreadModel: string | undefined;
  organizationDefaultModel: string | null;
  onChange: (model: string) => void;
  isGlobalLoading: boolean;
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
      currentThreadModel,
      organizationDefaultModel,
      onChange,
      isGlobalLoading,
    },
    ref
  ) => {
    const t = useTranslations('form');
    const [threadDocuments, setThreadDocuments] = useState<ThreadDocumentUI[]>(
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
      const newDocuments: ThreadDocumentUI[] = [];
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
        threadDocuments:
          threadDocuments.length > 0 ? threadDocuments : undefined,
      });
      setThreadDocuments([]);
    };

    const handleSend = () => {
      handleSubmit(handleFormSubmit)();
    };

    const promptValue = watch('prompt', '');
    // const useKnowledge = watch('useKnowledge');

    return (
      <div className="w-full px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col max-w-3xl mx-auto"
        >
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

          {!isPublicAccess && (
            <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                {...register('useKnowledge')}
                className="rounded border-border"
              />
              {t('selected-mode')}
            </label>
          )}
        </form>
      </div>
    );
  }
);

PromptForm.displayName = 'PromptForm';
