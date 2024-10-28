'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

import { Input, Button } from '@salesyy/common-ui';
import { zodResolver } from '@hookform/resolvers/zod';

import { validationSchema, type ApiKeyDto } from './types';
import { createApiKey } from './actions';

export const CreateApiKeyForm = () => {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations('api-keys');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyDto>({
    resolver: zodResolver(validationSchema(t)),
  });

  const handleCreateKey: SubmitHandler<ApiKeyDto> = async (data) => {
    const result = await createApiKey(data);
    if (result.success) {
      // TODO: display key from backend in dialog
      startTransition(() => router.push('/my-profile/api-keys'));
      toast.success('Key was created');
    } else {
      toast.error(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleCreateKey)} className="w-full space-y-6">
      <Input
        label={t('name')}
        {...register('name')}
        disabled={isPending}
        error={errors.name}
      />
      <div className="flex justify-end">
        <Button isLoading={isSubmitting}>{t('create')}</Button>
      </div>
    </form>
  );
};
