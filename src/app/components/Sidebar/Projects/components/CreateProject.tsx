import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import { StatusCodes } from 'http-status-codes';
import { useUser } from '@clerk/nextjs';

import { Dialog, DialogTitle } from '@ragenai/common-ui';
import { Button, Input } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { createProject } from '@/app/components/Sidebar/Projects/actions';
import { logger } from '@/app/lib/utils/logger';

interface CreateProjectProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProject({ isOpen, onClose }: CreateProjectProps) {
  const t = useTranslations();
  const { successToast, errorToast } = statusToast();
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      errorToast({
        message: t('projects.error.title-required'),
      });
      return;
    }

    if (!isLoaded) {
      logger.error('Organization not loaded');
      errorToast({
        message: t('projects.error.loading-organization'),
      });
      return;
    }

    if (!organization?.id) {
      logger.error('No organization ID');
      errorToast({
        message: t('projects.error.no-organization'),
      });
      return;
    }

    if (!user) {
      logger.error('No user');
      return;
    }

    setIsLoading(true);
    try {
      const { status, error, project } = await createProject(
        organization.id,
        title.trim(),
        user.id
      );

      if (error || !project) {
        logger.error('Project creation failed', { status, error });
        if (status === StatusCodes.CONFLICT) {
          errorToast({
            message: t('projects.error.project-exists'),
          });
        } else {
          throw new Error(error || t('projects.error.creation-failed'));
        }
        return;
      }

      successToast({
        message: t('projects.success.created'),
      });
      router.refresh();
      onClose();
    } catch (error) {
      logger.error({ err: error }, 'Project creation failed');
      errorToast({
        message: t('projects.error.creation-failed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{t('projects.create')}</DialogTitle>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Input
            id="title"
            placeholder={t('projects.placeholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLoading}
            className="py-1"
          />
          <div className="text-sm text-muted-foreground">
            <h4 className="font-medium">{t('projects.what-is-project')}</h4>
            <p>{t('projects.project-description')}</p>
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          <Button type="button" onClick={onClose} disabled={isLoading}>
            {t('projects.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {t('projects.create-project')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
