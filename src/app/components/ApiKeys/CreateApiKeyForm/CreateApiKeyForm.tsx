'use client';

import { useTransition, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, type SubmitHandler, useForm } from 'react-hook-form';

import { useRouter } from '@/i18n/routing';
import { Input, Button, Text, classMerge } from '@ragenai/common-ui';
import { zodResolver } from '@hookform/resolvers/zod';

import { validationSchema, type ApiKeyDto } from './types';
import { createApiKey } from './actions';
import { ApiKeyModal } from './ApiKeyModal';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchProjectsForUser } from '@/app/lib/services/project';
import { Select } from '@headlessui/react';

type ClientProject = Awaited<ReturnType<typeof fetchProjectsForUser>>;

type Props = {
  projects: ClientProject;
};

export const CreateApiKeyForm = ({ projects }: Props) => {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const t = useTranslations('api-keys');
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyDto>({
    resolver: zodResolver(validationSchema(t)),
  });
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { errorToast, successToast } = statusToast();

  const handleCreateKey: SubmitHandler<ApiKeyDto> = async (data) => {
    const result = await createApiKey(data);
    if (result.success) {
      setApiKey(result.payload.key);
      setIsModalOpen(true);
    } else {
      errorToast({ message: result.message });
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
          <div className="relative">
            <label className="block text-sm/6 text-gray-600 font-medium leading-6 dark:text-gray-300">
              {t('assistant')}
              <span className="text-red-600">*</span>
            </label>
            <Controller
              control={control}
              name="project_id"
              rules={{
                required: true,
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <Select
                  className={classMerge(
                    'block w-full py-2',
                    'ring-1 ring-inset ring-primary-blue-500 dark:ring-gray-600 rounded-md',
                    '*:text-black'
                  )}
                  onBlur={onBlur}
                  onChange={onChange}
                  value={value}
                >
                  <option value="0"></option>
                  {projects.map((project) => (
                    <option key={project.public_id} value={project.public_id}>
                      {project.title}
                    </option>
                  ))}
                </Select>
              )}
            />

            {errors.project_id && (
              <Text
                className="mt-4 text-sm text-red-600 dark:text-red-500"
                id="input-error"
              >
                {t('project-is-required')}
              </Text>
            )}
          </div>
          <Input
            label={t('name')}
            {...register('name')}
            mandatory
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
