import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useOrganization, useUser } from '@clerk/nextjs';
import { StatusCodes } from 'http-status-codes';

import { Dialog, DialogTitle } from '@ragenai/common-ui';
import { Button, Input } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { createProject } from '../actions';

import { type CreateProjectFormData, createProjectSchema } from '../types';

interface CreateProjectProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProject({ isOpen, onClose }: CreateProjectProps) {
  const t = useTranslations();
  const { successToast, errorToast } = statusToast();
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();
  const { user } = useUser();

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
        user.id
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
      router.refresh();
      onClose();
      reset();
    } catch (error) {
      logger.error({ err: error }, 'Project creation failed');
      errorToast({ message: t('projects.error.creation-failed') });
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{t('projects.create')}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Input
            id="title"
            placeholder={t('projects.placeholder')}
            {...register('title')}
            ref={inputRef}
            disabled={isSubmitting}
            className="py-1"
            error={errors.title}
            errorMessage={errors.title?.message}
          />
          <div className="text-sm text-muted-foreground">
            <h4 className="font-medium">{t('projects.what-is-project')}</h4>
            <p>{t('projects.project-description')}</p>
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          <Button type="button" onClick={onClose} disabled={isSubmitting}>
            {t('projects.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {t('projects.create-project')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
