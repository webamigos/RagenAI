'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

import { Input, Button } from '@ragenai/common-ui';
import { zodResolver } from '@hookform/resolvers/zod';

import { validationSchema, type ApiKeyDto } from './types';
import { createApiKey } from './actions';
import { ApiKeyModal } from './ApiKeyModal';

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
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateKey: SubmitHandler<ApiKeyDto> = async (data) => {
    const result = await createApiKey(data);
    if (result.success) {
      setApiKey(result.payload.key);
      setIsModalOpen(true);
    } else {
      toast.error(result.message);
    }
  };

  const handleModalClose = () => {
    setApiKey(null);
    setIsModalOpen(false);
    startTransition(() => router.push('/my-profile/api-keys'));
  };

  return (
    <div className="flex w-full flex-col">
      <div className="mt-4">
        <form
          onSubmit={handleSubmit(handleCreateKey)}
          className="w-full space-y-6"
        >
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
      </div>
      <ApiKeyModal
        isOpen={isModalOpen}
        apiKey={apiKey || ''}
        onClose={handleModalClose}
      />
    </div>
  );
};
