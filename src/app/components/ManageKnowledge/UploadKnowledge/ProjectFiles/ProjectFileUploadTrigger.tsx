'use client';

import { useState } from 'react';
import { Card, Dialog, ClourArrowIcon, Text } from '@ragenai/common-ui';
import { ProjectFileUpload } from './ProjectFileUpload';
import { useTranslations } from 'next-intl';

type Props = {
  projectId: number;
  projectPublicId: string;
};

export const ProjectFileUploadTrigger = ({
  projectId,
  projectPublicId,
}: Props) => {
  const [showUploader, setShowUploader] = useState(false);
  const t = useTranslations('projects');

  return (
    <>
      <Card
        onClick={() => setShowUploader(true)}
        className="w-full py-6 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-50 dark:hover:bg-accent-dark-700 text-gray-800 cursor-pointer"
      >
        <div className="flex items-center gap-1 dark:text-gray-200">
          <Text>{t('upload-file')}</Text>
          <ClourArrowIcon className="h-5 w-5" />
        </div>
      </Card>

      <Dialog
        open={showUploader}
        onClose={() => setShowUploader(false)}
        size="lg"
      >
        <ProjectFileUpload
          projectId={projectId}
          projectPublicId={projectPublicId}
        />
      </Dialog>
    </>
  );
};
