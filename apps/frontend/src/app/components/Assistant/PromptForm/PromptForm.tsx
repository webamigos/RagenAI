'use client';

import { SubmitHandler, useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';

import { Button, Textarea } from '@salesyy/common-ui';
import {
  type CreateMessageDto,
  createMessageSchema,
} from '../../../contracts/Message';

type Props = {
  isLoading: boolean;
  handleCloseThread: () => void;
  onSubmit: SubmitHandler<CreateMessageDto>;
};

export const PromptForm = ({
  isLoading,
  handleCloseThread,
  onSubmit,
}: Props) => {
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateMessageDto>({
    resolver: zodResolver(createMessageSchema),
  });
  const t = useTranslations('form');

  const handleFormSubmit: SubmitHandler<CreateMessageDto> = async (data) => {
    reset();
    onSubmit(data);
  };

  return (
    <div className="rounded-lg text-sm ">
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <Textarea
          label={t('enter-your-question')}
          placeholder={t('lets-chat')}
          {...register('prompt')}
          rows={2}
          error={errors.prompt}
          errorMessage={t('provide-at-least-10-characters')}
        />
        <div className="flex flex-row">
          <div className="w-1/2">
            <p>
              <Button
                label={t('close-thread')}
                onClick={handleCloseThread}
                className="cursor-pointer"
              />
            </p>
          </div>
          <div className="w-1/2 flex  justify-end">
            <Button
              type="submit"
              label={t('send')}
              icon={
                <PaperAirplaneIcon
                  className="mt-0.5 h-5 w-5 flex-none text-white cursor-pointer"
                  aria-hidden="true"
                />
              }
              className="bg-salesyy-red hover:bg-red-700 cursor-pointer disabled:bg-red-400"
              disabled={isLoading}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
