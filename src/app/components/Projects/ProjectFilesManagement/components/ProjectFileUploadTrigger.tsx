'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { Card, Dialog } from '@ragenai/common-ui';

import { getProjectFiles } from '@/app/actions';
import { ProjectFileUpload } from './ProjectFileUpload';
import {
  ProjectFileUploadContent,
  FileStatus,
} from './ProjectFileUploadContent';
import { ShareDialog } from '../../ShareDialog/index';

type Props = {
  projectId: number;
  projectPublicId: string;
};

export const ProjectFileUploadTrigger = ({
  projectId,
  projectPublicId,
}: Props) => {
  const [showUploader, setShowUploader] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [fileStatus, setFileStatus] = useState<FileStatus>({
    hasFiles: false,
    fileCount: 0,
    loading: true,
  });

  const t = useTranslations('projects');
  const { organization } = useOrganization();

  useEffect(() => {
    const checkProjectFiles = async () => {
      if (!organization) {
        return;
      }

      try {
        const result = await getProjectFiles(projectId);

        if (!result.error && result.files) {
          setFileStatus({
            hasFiles: result.files.length > 0,
            fileCount: result.files.length,
            loading: false,
          });
        } else {
          setFileStatus({
            hasFiles: false,
            fileCount: 0,
            loading: false,
          });
        }
      } catch (error) {
        setFileStatus({
          hasFiles: false,
          fileCount: 0,
          loading: false,
        });
      }
    };

    checkProjectFiles();
  }, [projectId, organization, showUploader]);

  return (
    <>
      <Card
        size="full"
        onClick={() => setShowUploader(true)}
        className="group relative h-28 cursor-pointer"
      >
        <ProjectFileUploadContent
          status={fileStatus}
          t={t}
          onRssClick={() => setShowShareDialog(true)}
        />
      </Card>

      <Dialog
        className="max-h-[400px] overflow-y-auto"
        open={showUploader}
        onClose={() => setShowUploader(false)}
      >
        <ProjectFileUpload
          projectId={projectId}
          projectPublicId={projectPublicId}
          initialFileCount={fileStatus.fileCount}
        />
      </Dialog>

      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        projectId={projectId}
      />
    </>
  );
};
