import { SubmitHandler, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';

import { AskQuestion } from './';
import {
  ChatType,
  type CreateMessageDto,
  createMessageSchema,
} from '../../../contracts/Message';
import { forwardRef, useImperativeHandle } from 'react';
import { useTranslations } from 'next-intl';

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  handleResponseType: () => void;
  onSubmit: SubmitHandler<CreateMessageDto>;
};

export type PromptFormRef = {
  reset: (prompt?: string) => void;
};

export const PromptForm = forwardRef<PromptFormRef, Props>(
  ({ isLoading, isUserLogged, onSubmit, handleResponseType }, ref) => {
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
      reset({ prompt: '' });
      onSubmit({
        ...data,
        mode: data.useKnowledge ? ChatType.RAG : ChatType.CONVERSATION,
        messageType: data.messageType || 'TEXT',
        voiceDurationSeconds: data.voiceDurationSeconds,
      });
    };

    const handleSend = () => {
      handleSubmit(handleFormSubmit)();
    };

    const promptValue = watch('prompt', '');
    const useKnowledge = watch('useKnowledge');

    return (
      <div className="mt-auto px-4 sm:px-4 md:px-2 lg:px-22">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col w-full justify-center"
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
            />
          </div>
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
        </form>
      </div>
    );
  }
);

PromptForm.displayName = 'PromptForm';
