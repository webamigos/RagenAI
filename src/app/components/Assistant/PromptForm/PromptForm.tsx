import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AskQuestion } from './';
import {
  ChatType,
  type CreateMessageDto,
  createMessageSchema,
} from '../../../contracts/Message';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageContentType } from '@prisma/client';

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  handleResponseType?: () => void;
  isPublicAccess?: boolean;
  onSubmit: SubmitHandler<CreateMessageDto>;
};

export type PromptFormRef = {
  reset: (prompt?: string) => void;
};

export const PromptForm = forwardRef<PromptFormRef, Props>(
  (
    { isLoading, isUserLogged, onSubmit, isPublicAccess, handleResponseType },
    ref
  ) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const {
      register,
      reset,
      handleSubmit,
      formState: { errors },
      watch,
      setValue,
    } = useForm<CreateMessageDto>({
      resolver: zodResolver(createMessageSchema),
      reValidateMode: 'onSubmit',
      defaultValues: {
        useKnowledge: true,
      },
    });
    const t = useTranslations('form');

    useImperativeHandle(ref, () => ({
      reset: (prompt) => reset({ prompt }),
    }));

    const handleFormSubmit: SubmitHandler<CreateMessageDto> = async (data) => {
      if (isSubmitting) return;

      try {
        setIsSubmitting(true);
        const messageData = {
          ...data,
          mode: data.useKnowledge ? ChatType.RAG : ChatType.CONVERSATION,
          messageType: data.messageType || MessageContentType.TEXT,
          voiceDurationSeconds: data.voiceDurationSeconds,
        };

        await onSubmit(messageData);
        reset({ prompt: '' });
      } catch (error) {
        // Przywracamy poprzednią wartość w przypadku błędu
        setValue('prompt', data.prompt);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleSend = () => {
      handleSubmit(handleFormSubmit)();
    };

    const promptValue = watch('prompt', '');
    const useKnowledge = watch('useKnowledge');

    const isDisabled = isLoading || isSubmitting;

    return (
      <div className="mt-auto px-4 sm:px-4 md:px-2 lg:px-22">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col w-full justify-center"
        >
          <div className="flex w-full justify-center">
            <AskQuestion
              isUserLogged={isUserLogged}
              disabled={isDisabled}
              error={errors?.prompt}
              register={register}
              onSend={handleSend}
              value={promptValue}
              handleResponseType={
                handleResponseType ? handleResponseType : () => {}
              }
              setPromptValue={(text: string) => setValue('prompt', text)}
              showVoiceInput={!isPublicAccess}
              isPending={isSubmitting}
            />
          </div>
          {!isPublicAccess && (
            <div className="flex w-full justify-center">
              <label className="w-full md:w-11/12 mt-3 text-sm text-gray-400">
                <input
                  type="checkbox"
                  {...register('useKnowledge')}
                  className="mr-1"
                  disabled={isDisabled}
                />
                {t('selected-mode')}
              </label>
            </div>
          )}
        </form>
      </div>
    );
  }
);

PromptForm.displayName = 'PromptForm';
