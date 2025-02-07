import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTitle } from '@ragenai/common-ui';
import { Button, Input } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { createProject } from '@/app/[locale]/manage-knowledge/projects/actions';
import { useOrganization } from '@clerk/nextjs';
import { StatusCodes } from 'http-status-codes';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      errorToast({
        message: t('projects.error.title-required'),
      });
      return;
    }

    if (!isLoaded) {
      errorToast({
        message: t('projects.error.loading-organization'),
      });
      return;
    }

    if (!organization?.id) {
      errorToast({
        message: t('projects.error.no-organization'),
      });
      return;
    }

    setIsLoading(true);
    try {
      const { status, error, project } = await createProject(
        organization.id,
        title.trim()
      );

      if (error || !project) {
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
      errorToast({
        message: t('projects.error.creation-failed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      {/* <DialogContent className="sm:max-w-[425px]">
                <DialogHeader> */}
      <DialogTitle>{t('projects.create')}</DialogTitle>
      {/* </DialogHeader> */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Input
            id="title"
            placeholder={t('projects.placeholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLoading}
          />
          <div className="text-sm text-muted-foreground">
            <h4 className="font-medium">{t('projects.what-is-project')}</h4>
            <p>{t('projects.project-description')}</p>
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            // variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            {t('projects.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {t('projects.create-project')}
          </Button>
        </div>
      </form>
      {/* </DialogContent> */}
    </Dialog>
  );
}
