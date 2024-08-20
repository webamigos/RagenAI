'use client';

import { MouseEventHandler } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';

import { zodResolver } from '@hookform/resolvers/zod';

import { Contact, CloseThread, SendMessage, AskQuestion } from './';
import {
  type CreateMessageDto,
  createMessageSchema,
} from '../../../contracts/Message';

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  handleCloseThread: MouseEventHandler<HTMLButtonElement>;
  onSubmit: SubmitHandler<CreateMessageDto>;
};

export const PromptForm = ({
  isLoading,
  isUserLogged,
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
    <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
      <div className="rounded-lg text-sm ">
        <p>{isUserLogged ? t('lets-chat-user') : t('lets-chat')}</p>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex w-full">
          <AskQuestion
            disabled={isLoading}
            error={errors?.prompt}
            register={register}
          />
          <div className="w-3/12 md:w-2/12 flex justify-end items-end ml-2">
            <SendMessage disabled={isLoading} />
          </div>
        </form>
        <div className="mt-6 flex flex-row pb-4 items-center justify-start">
          <p className="flex  dark:text-slate-100">
            <CloseThread handleCloseThread={handleCloseThread} />
            <Contact />
          </p>
        </div>
      </div>
    </div>
  );
};
