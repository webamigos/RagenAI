'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { type ComponentProps } from 'react';

import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { Button, Input, Textarea, Card, Text } from '@ragenai/common-ui';

const supportFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  title: z.string().min(5, 'Title must be at least 5 characters long'),
  message: z.string().min(10, 'Message must be at least 10 characters long'),
  file: z
    .instanceof(File)
    .optional()
    .refine(
      (file) => !file || file.size < 5 * 1024 * 1024,
      'File size must be less than 5MB'
    ),
});

type SupportFormData = z.infer<typeof supportFormSchema>;

export const SupportForm = ({ className }: ComponentProps<'div'>) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(supportFormSchema),
    defaultValues: {
      email: '',
      title: '',
      message: '',
      file: undefined,
    },
  });

  const { errorToast, successToast } = statusToast();
  const t = useTranslations('support-page');

  const onSubmit = async (data: SupportFormData) => {
    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'contact',
          email: data.email,
          message: data.message,
          title: data.title,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      successToast({ message: 'Your request has been sent successfully.' });
      reset();
    } catch (error) {
      logger.error({ err: error }, 'Failed to send email');
      errorToast({
        message: 'Failed to send request. Please try again later.',
      });
    }
  };

  return (
    <Card size="full" title={t('card-title')} className="max-w-lg mx-auto p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Input
            mandatory
            label="email"
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
            error={errors.message}
            errorMessage={errors.message?.message}
          />
        </div>
        <div>
          <Input
            label={t('file-label')}
            mandatory={false}
            type="file"
            accept="image/*"
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
          {isSubmitting ? 'Sending...' : 'Submit'}
        </Button>
      </form>
    </Card>
  );
};
