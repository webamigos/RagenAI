'use client';

import { MouseEventHandler } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import { PaperAirplaneIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';

import { Button, Input } from '@salesyy/common-ui';
import {
  type CreateMessageDto,
  createMessageSchema,
} from '../../../contracts/Message';

type Props = {
  isLoading: boolean;
  handleCloseThread: MouseEventHandler<HTMLButtonElement>;
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
    reValidateMode: 'onSubmit',
  });
  const t = useTranslations('form');

  const handleFormSubmit: SubmitHandler<CreateMessageDto> = async (data) => {
    reset();
    onSubmit(data);
  };

  return (
    <div className="px-16 sm:px-24 lg:px-22 pb-8">
      <div className="rounded-lg text-sm ">
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Input
            label={t('enter-your-question')}
            placeholder={t('lets-chat')}
            {...register('prompt')}
            disabled={isLoading}
            error={errors.prompt}
            errorMessage={t('provide-at-least-10-characters')}
            className="h-10"
          />
          <div className="mt-6 flex flex-row">
            <div className="w-1/2">
              <p>
                <Button
                  type="button"
                  label={t('close-thread')}
                  onClick={handleCloseThread}
                  className="cursor-pointer"
                  iconLeft={
                    <ArchiveBoxIcon
                      className="h-5 w-5 flex-none text-white cursor-pointer"
                      aria-hidden="true"
                    />
                  }
                />
              </p>
            </div>
            <div className="w-1/2 flex justify-end">
              <Button
                type="submit"
                label={t('send')}
                iconRight={
                  <PaperAirplaneIcon
                    className="h-5 w-5 flex-none text-white cursor-pointer"
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
    </div>
  );
};
