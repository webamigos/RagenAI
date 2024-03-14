'use client';

import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';

import { Button, Textarea } from '@salesyy/common-ui';
import { type MessageDto, messageSchema } from '../../../contracts/MessageDto';
import { useTranslations } from 'next-intl';

type Props = {
  onSubmit: SubmitHandler<MessageDto>;
};

export const PromptForm = ({ onSubmit }: Props) => {
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<MessageDto>({
    resolver: zodResolver(messageSchema),
  });
  const t = useTranslations('form');

  const handleFormSubmit: SubmitHandler<MessageDto> = async (data) => {
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
        <div className="flex justify-end">
          <Button
            type="submit"
            label={t('send')}
            icon={
              <PaperAirplaneIcon
                className="mt-0.5 h-5 w-5 flex-none text-white cursor-pointer"
                aria-hidden="true"
              />
            }
            className="bg-salesyy-red hover:bg-red-700"
          />
        </div>
      </form>
    </div>
  );
};
