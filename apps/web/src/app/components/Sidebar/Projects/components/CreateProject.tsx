import { useEffect, useRef, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { StatusCodes } from 'http-status-codes';

import { LightBulbIcon } from '@heroicons/react/24/outline';

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
      <DialogContent className="sm:max-w-lg top-[20%] translate-y-0 sm:top-[20%]">
        <DialogHeader>
          <DialogTitle>{t('projects.create')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('projects.what-is-project')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              {t('projects.assistant-name')}
            </label>
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
                className="mt-1.5 text-xs text-destructive"
              >
                {errors.title.message}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              {t('projects.what-is-project')}
            </p>
            <div className="flex gap-2 rounded-lg border border-pending/40 bg-pending/10 p-3 text-sm text-foreground">
              <LightBulbIcon className="size-4 shrink-0 mt-0.5" />
              <p>{t('projects.project-description')}</p>
            </div>
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
              className="bg-primary text-primary-foreground hover:bg-ink-hover focus-visible:ring-ring/40 dark:hover:bg-paper-200"
            >
              {t('projects.create-project')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
