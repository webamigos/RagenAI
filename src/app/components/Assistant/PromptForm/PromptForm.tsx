import { forwardRef, useImperativeHandle } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitHandler, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';

import { AskQuestion } from './';
import {
  ChatType,
  type CreateMessageDto,
  ChatResponseType,
} from '../../../contracts/Message';
import { createMessageSchema } from '../../../contracts/Message';
import { ModelSelector } from '../ModelSelector';

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  handleResponseType?: () => void;
  isPublicAccess?: boolean;
  onSubmit: SubmitHandler<CreateMessageDto>;
  responseType: ChatResponseType;
  currentThreadModel: string | undefined;
  organizationDefaultModel: string;
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
    // const useKnowledge = watch('useKnowledge');

    return (
      <div className="dark:bg-zinc-900 p-4 w-full">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col max-w-2xl"
        >
          <div className="flex w-full justify-end">
            {!isPublicAccess && (
              <ModelSelector
                currentModel={currentThreadModel || undefined}
                organizationDefaultModel={organizationDefaultModel}
                onChange={onChange}
                disabled={isGlobalLoading}
              />
            )}
          </div>
          <AskQuestion
            isUserLogged={isUserLogged}
            disabled={isLoading}
            error={errors?.prompt}
            register={register}
            onSend={handleSend}
            value={promptValue}
            handleResponseType={handleResponseType}
            setPromptValue={(text: string) => setValue('prompt', text)}
          />

          {!isPublicAccess && (
            <div className="flex w-full">
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
