import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { Button } from '@ragenai/common-ui/Button';

import { ShareDialog } from './ShareDialog';

type ShareDialogTriggerProps = {
  projectId: number;
  isPublicProject: boolean;
  accessToken: string;
  publishedAt: string;
};

export const ShareDialogTrigger = ({
  projectId,
  isPublicProject,
  accessToken,
  publishedAt,
}: ShareDialogTriggerProps) => {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const t = useTranslations('projects.project-view');

  return (
    <>
      <Button type="button" outline onClick={() => setShowShareDialog(true)}>
        <ArrowUpTrayIcon className="size-4 mr-1" />
        {t('share')}
      </Button>

      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        projectId={projectId}
        isPublicProject={isPublicProject}
        linkToPublicProject={accessToken}
        publishedAt={publishedAt}
      />
    </>
  );
};
