'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { Button, Input, Textarea, Card, Text } from '@ragenai/common-ui';
import { sendSupportRequest } from '@/app/lib/services/api';

import { getSupportFormSchema, SupportFormData } from './types';

export const SupportForm = () => {
  const t = useTranslations('support-page');
  const schema = getSupportFormSchema(t);

  const { errorToast, successToast } = statusToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      title: '',
      message: '',
      file: undefined,
    },
  });

  const onSubmit = async (data: SupportFormData) => {
    try {
      await sendSupportRequest(
        {
          email: data.email,
          title: data.title,
          message: data.message,
        },
        data.file
      );

      successToast({ message: t('send-success') });
      reset();
    } catch (error) {
      logger.error({ err: error }, 'Failed to send email');
      errorToast({
        message: t('send-error'),
      });
    }
  };

  return (
    <Card
      size="full"
      title={t('card-title')}
      className="w-full lg:max-w-lg lg:ml-4 max-h-[650px] overflow-auto"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Input
            mandatory
            label="Email"
            type="email"
            {...register('email')}
            className="w-full mt-1 p-2"
            error={errors.email}
            errorMessage={errors.email?.message}
          />
        </div>
        <div>
          <Input
            label={t('input-title')}
            mandatory={true}
            type="text"
            {...register('title')}
            className="w-full mt-1 p-2 border cursor-auto"
            error={errors.title}
            errorMessage={errors.title?.message}
          />
        </div>
        <div>
          <Textarea
            mandatory
            label={t('text-area-title')}
            {...register('message')}
            rows={4}
            className="w-full mt-1 p-2 border rounded-md"
            placeholder={t('text-area-placeholder')}
            error={errors.message}
            errorMessage={errors.message?.message}
            showVoiceInput={false}
          />
        </div>
        <div>
          <Input
            label={t('file-label')}
            mandatory={false}
            type="file"
            accept="image/*"
            multiple
            {...register('file')}
            className="w-full mt-1 p-2 border rounded-md"
            error={errors.file}
            errorMessage={errors.file?.message}
          />
        </div>
        <Text color="gray-400" fontSize="sm">
          *{t('submessage')}
        </Text>
        <Button
          type="submit"
          className="w-full flex justify-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('sending') : t('send')}
        </Button>
      </form>
    </Card>
  );
};
