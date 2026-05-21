import { useEffect, useRef, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { StatusCodes } from 'http-status-codes';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
        router.push(`/projects/${project.id}`);
        onClose();
        reset();
      });
    } catch (error) {
      logger.error({ err: error }, 'Project creation failed');
      errorToast({ message: t('projects.error.creation-failed') });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const titleRegister = register('title');

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projects.create')}</DialogTitle>
          <DialogDescription>{t('projects.what-is-project')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Input
              id="title"
              placeholder={t('projects.placeholder')}
              {...titleRegister}
              ref={(e) => {
                titleRegister.ref(e);
                inputRef.current = e;
              }}
              disabled={isSubmitting}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? 'title-error' : undefined}
              autoFocus
            />
            {errors.title?.message && (
              <p
                id="title-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600 dark:text-red-400"
              >
                {errors.title.message}
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t('projects.project-description')}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting || isPending}
            >
              {t('projects.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isPending}
              className="bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500/40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {t('projects.create-project')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
