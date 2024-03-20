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
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Input
            label={t('lets-chat')}
            placeholder={t('enter-your-question')}
            {...register('prompt')}
            disabled={isLoading}
            error={errors.prompt}
            errorMessage={t('provide-at-least-10-characters')}
            className="h-10"
          />
          <div className="mt-6 flex flex-row pb-4">
            <div className="w-1/2 md:w-1/3">
              <Button
                type="button"
                label={t('close-thread')}
                onClick={handleCloseThread}
                className=" bg-red-600 hover:bg-red-700 disabled:bg-red-400"
                iconLeft={
                  <ArchiveBoxIcon
                    className="h-5 w-5 flex-none text-white cursor-pointer"
                    aria-hidden="true"
                  />
                }
              />
            </div>
            <div className="hidden md:w-1/3 md:flex items-center justify-center">
              <p
                onClick={() =>
                  (window.location.href =
                    'mailto:hello@salesyy.com?body=Współpraca')
                }
              >
                <span className="flex items-center">
                  <EnvelopeIcon
                    className="h-5 w-5 flex-none mr-2 dark:text-white cursor-pointer"
                    aria-hidden="true"
                  />

                  {t('contact-with-us')}
                </span>
              </p>
            </div>
            <div className="w-1/2 md:w-1/3 flex justify-end">
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
          </div>
          <div className="md:hidden mt-2 flex items-center justify-end">
            <p
              onClick={() =>
                (window.location.href =
                  'mailto:hello@salesyy.com?body=Współpraca')
              }
            >
              <span className="flex items-center">
                <EnvelopeIcon
                  className="h-5 w-5 flex-none mr-2 dark:text-white cursor-pointer"
                  aria-hidden="true"
                />

                {t('contact-with-us')}
              </span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
