import { useEffect, useRef, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { StatusCodes } from 'http-status-codes';

import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';

import { createProject } from '../actions';

import { type CreateProjectFormData, createProjectSchema } from '../types';

type CreateProjectProps = {
  isOpen: boolean;
  onClose: () => void;
  refreshProjects: () => Promise<void>;
};

export function CreateProject({
  isOpen,
  onClose,
  refreshProjects,
}: CreateProjectProps) {
  const t = useTranslations();
  const { successToast, errorToast } = statusToast();
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();
  const { user } = useUser();
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
  });

  const onSubmit = async (data: CreateProjectFormData) => {
    if (!isLoaded) {
      logger.error('Organization not loaded');
      errorToast({ message: t('projects.error.loading-organization') });
      return;
    }

    if (!organization?.id) {
      logger.error('No organization ID');
      errorToast({ message: t('projects.error.no-organization') });
      return;
    }

    if (!user) {
      logger.error('No user');
      return;
    }

    try {
      const { status, error, project } = await createProject(
        organization.id,
        data.title,
        user.id,
      );

      if (error || !project) {
        logger.error('Project creation failed', { status, error });
        if (status === StatusCodes.CONFLICT) {
          errorToast({ message: t('projects.error.project-exists') });
        } else {
          throw new Error(error || t('projects.error.creation-failed'));
        }
        return;
      }

      successToast({ message: t('projects.success.created') });
      startTransition(async () => {
        await refreshProjects();
        router.push(`/projects/${project.public_id}`);
        onClose();
        reset();
      });
    } catch (error) {
      logger.error({ err: error }, 'Project creation failed');
      errorToast({ message: t('projects.error.creation-failed') });
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>{t('projects.create')}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="title"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t('projects.what-is-project')}
          </label>
          <Input
            id="title"
            placeholder={t('projects.placeholder')}
            {...register('title')}
            ref={(e) => {
              register('title').ref(e);
              inputRef.current = e;
            }}
            disabled={isSubmitting}
            error={errors.title}
            errorMessage={errors.title?.message}
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {t('projects.project-description')}
          </p>
        </div>
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            plain
            onClick={onClose}
            disabled={isSubmitting || isPending}
          >
            {t('projects.cancel')}
          </Button>
          <Button isSubmit={true} disabled={isSubmitting || isPending}>
            {t('projects.create-project')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
