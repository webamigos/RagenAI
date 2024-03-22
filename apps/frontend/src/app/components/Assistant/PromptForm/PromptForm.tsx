'use client';

import { MouseEventHandler } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PaperAirplaneIcon,
  ArchiveBoxIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';

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
    <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
      <div className="rounded-lg text-sm ">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex w-full">
          <Input
            label={t('lets-chat')}
            placeholder={t('enter-your-question')}
            {...register('prompt')}
            disabled={isLoading}
            error={errors.prompt}
            errorMessage={t('provide-at-least-10-characters')}
            className="h-10"
            containerClassName="w-9/12 md:w-10/12"
          />

          <div className="w-3/12 md:w-2/12 flex justify-end items-end">
            <Button
              type="submit"
              label={t('send')}
              iconRight={
                <PaperAirplaneIcon
                  className="h-5 w-5 flex-none text-white cursor-pointer"
                  aria-hidden="true"
                />
              }
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400"
              disabled={isLoading}
            />
          </div>
        </form>
        <div className="mt-6 flex flex-row pb-4 items-center justify-start">
          <p className="flex  dark:text-slate-100">
            <span
              className="flex items-center cursor-pointer mr-4"
              onClick={handleCloseThread}
            >
              <ArchiveBoxIcon
                className="h-5 w-5 flex-none mr-2  cursor-pointer"
                aria-hidden="true"
              />
              {t('close-thread')}
            </span>

            <span
              className="flex items-center cursor-pointer"
              onClick={() =>
                (window.location.href =
                  'mailto:hello@salesyy.com?body=Współpraca')
              }
            >
              <EnvelopeIcon
                className="h-5 w-5 flex-none mr-2 dark:text-white cursor-pointer"
                aria-hidden="true"
              />

              {t('contact-with-us')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
