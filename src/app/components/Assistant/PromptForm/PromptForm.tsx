import { SubmitHandler, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';

import { AskQuestion } from './';
import {
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
    });

    useImperativeHandle(ref, () => ({
      reset: (prompt) => reset({ prompt }),
    }));

    const handleFormSubmit: SubmitHandler<CreateMessageDto> = async (data) => {
      reset({ prompt: '' });
      onSubmit(data);
    };

    const handleSend = () => {
      handleSubmit(handleFormSubmit)();
    };

    const promptValue = watch('prompt', '');

    return (
      <div className="mt-auto px-4 sm:px-4 lg:px-22">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex w-full justify-center"
        >
          <AskQuestion
            isUserLogged={isUserLogged}
            disabled={isLoading}
            error={errors?.prompt}
            register={register}
            onSend={handleSend}
            value={promptValue}
          />
        </form>
      </div>
    );
  }
);

PromptForm.displayName = 'PromptForm';
