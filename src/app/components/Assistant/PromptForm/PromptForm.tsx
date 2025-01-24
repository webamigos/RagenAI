import { SubmitHandler, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';

import { AskQuestion } from './';
import {
  ChatType,
  type CreateMessageDto,
  createMessageSchema,
} from '../../../contracts/Message';
import { forwardRef, useImperativeHandle } from 'react';

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  onSubmit: SubmitHandler<CreateMessageDto>;
};

export type PromptFormRef = {
  reset: (prompt?: string) => void;
};

export const PromptForm = forwardRef<PromptFormRef, Props>(
  ({ isLoading, isUserLogged, onSubmit }, ref) => {
    const {
      register,
      reset,
      handleSubmit,
      formState: { errors },
      watch,
    } = useForm<CreateMessageDto>({
      resolver: zodResolver(createMessageSchema),
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
      });
    };

    const handleSend = () => {
      handleSubmit(handleFormSubmit)();
    };

    const promptValue = watch('prompt', '');
    const useKnowledge = watch('useKnowledge');

    return (
      <div className="mt-auto px-4 sm:px-4 lg:px-22">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex w-full justify-center"
        >
          <div className="flex w-full justify-center flex-col pt-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" {...register('useKnowledge')} />
              Selected mode:{' '}
              {useKnowledge ? ChatType.RAG : ChatType.CONVERSATION}
            </label>

            <AskQuestion
              isUserLogged={isUserLogged}
              disabled={isLoading}
              error={errors?.prompt}
              register={register}
              onSend={handleSend}
              value={promptValue}
            />
          </div>
        </form>
      </div>
    );
  }
);

PromptForm.displayName = 'PromptForm';
