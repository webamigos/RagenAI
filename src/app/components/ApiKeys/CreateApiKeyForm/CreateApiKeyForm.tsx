'use client';

import { useTransition, useState } from 'react';
import { useTranslations } from 'next-intl';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { useRouter } from '@/i18n/routing';
import { Input } from '@ragenai/common-ui/Input';
import { zodResolver } from '@hookform/resolvers/zod';

import { validationSchema, type ApiKeyDto } from './types';
import { createApiKey } from './actions';
import { ApiKeyModal } from './ApiKeyModal';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchProjectsForUser } from '@/app/lib/services/project';
import { Button } from '@ragenai/common-ui/Button';
import { Select } from '@ragenai/common-ui/Select';

type ClientProject = Awaited<ReturnType<typeof fetchProjectsForUser>>;

type Props = {
  projects: ClientProject;
  defaultPublicProjectId: string | null;
};

export const CreateApiKeyForm = ({
  projects,
  defaultPublicProjectId,
}: Props) => {
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
            <Select
              {...register('project_id')}
              label={t('knowledge-source')}
              error={errors.project_id}
              errorMessage={t('project-is-required')}
              mandatory
            >
              <option value="0"></option>
              {projects.map((project) => (
                <option key={project.public_id} value={project.public_id}>
                  {project.public_id === defaultPublicProjectId
                    ? t('main-knowledge-base').toUpperCase()
                    : project.title}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label={t('name')}
            {...register('name')}
            mandatory
            disabled={isPending}
            error={errors.name}
          />
          <div className="flex justify-end">
            <Button isSubmit={true} isLoading={isSubmitting}>
              {t('create')}
            </Button>
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
