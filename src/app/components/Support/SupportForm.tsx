'use client';

import { useForm, type FieldError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { Button } from '@ragenai/common-ui/Button';
import { Card } from '@ragenai/common-ui/Card';
import { Input } from '@ragenai/common-ui/Input';
import { Text } from '@ragenai/common-ui/Text';
import { Textarea } from '@ragenai/common-ui/Textarea';
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
      title: '',
      message: '',
      file: undefined,
    },
  });

  const onSubmit = async (data: SupportFormData) => {
    try {
      await sendSupportRequest(
        {
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
    <Card size="full" title={t('card-title')} className="w-full">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Input
            label={t('input-title')}
            mandatory={true}
            type="text"
            {...register('title')}
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
            error={errors.file as FieldError | undefined}
            errorMessage={(errors.file as FieldError | undefined)?.message}
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
