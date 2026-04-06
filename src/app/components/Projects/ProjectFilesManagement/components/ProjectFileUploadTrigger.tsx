'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/app/hooks/use-auth';
import { Card } from '@ragenai/common-ui/Card';
import { Text } from '@ragenai/common-ui/Text';
import { Dialog } from '@ragenai/common-ui/Dialog';
import {
  ArrowUpTrayIcon,
  BookOpenIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { getProjectFiles } from '@/app/actions';
import { ProjectFileUpload } from './ProjectFileUpload';
import {
  ProjectFileUploadContent,
  type FileStatus,
} from './ProjectFileUploadContent';
import { KnowledgeBasePickerDialog } from '@/app/components/KnowledgeBasePickerDialog';
import { GoogleDrivePickerDialog } from '@/app/components/GoogleDrivePickerDialog';
import { FirefliesPickerDialog } from '@/app/components/FirefliesPickerDialog';
import { importFilesToProject } from '@/app/actions';
import {
  isDriveConnected,
  importDriveFileToProject,
} from '@/app/actions/google-drive';
import { isFirefliesConnected } from '@/app/actions/fireflies';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';

type Props = {
  projectId: string;
};

export const ProjectFileUploadTrigger = ({ projectId }: Props) => {
  const [showUploader, setShowUploader] = useState(false);
  const [isKbPickerOpen, setIsKbPickerOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isFirefliesPickerOpen, setIsFirefliesPickerOpen] = useState(false);
  const [hasDriveConnector, setHasDriveConnector] = useState(false);
  const [hasFirefliesConnector, setHasFirefliesConnector] = useState(false);
  const [fileStatus, setFileStatus] = useState<FileStatus>({
    hasFiles: false,
    fileCount: 0,
    loading: true,
  });
  const t = useTranslations('projects');
  const tAttach = useTranslations('prompt-attachments');
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
      } catch {
        setFileStatus({
          hasFiles: false,
          fileCount: 0,
          loading: false,
        });
      }
    };

    checkProjectFiles();
  }, [projectId, organization, showUploader]);

  useEffect(() => {
    isDriveConnected()
      .then(setHasDriveConnector)
      .catch(() => setHasDriveConnector(false));
    isFirefliesConnected()
      .then(setHasFirefliesConnector)
      .catch(() => setHasFirefliesConnector(false));
  }, []);

  const handleKbFilesSelected = async (
    selected: {
      id: string;
      name: string;
      size: number;
      type: string;
    }[],
  ) => {
    try {
      const fileIds = selected.map((f) => f.id);
      await importFilesToProject(fileIds, projectId);
    } catch {
      // Import error is non-critical
    }
    // Refresh file status
    setShowUploader((v) => !v);
    setTimeout(() => setShowUploader(false), 0);
  };

  const handleExternalFileSelected = async (doc: ThreadDocumentUI) => {
    try {
      if (doc.driveFileId) {
        await importDriveFileToProject(
          doc.driveFileId,
          doc.name,
          doc.driveModifiedTime || '',
          projectId,
        );
      } else {
        // Non-Drive files (e.g. Fireflies): upload via FormData
        const blob = new Blob([doc.content], { type: 'text/markdown' });
        const fileName = doc.name.endsWith('.md') ? doc.name : `${doc.name}.md`;
        const file = new File([blob], fileName, { type: 'text/markdown' });
        const { uploadProjectFiles } = await import('@/app/lib/services/api');
        const formData = new FormData();
        formData.append('files', file);
        formData.append('projectId', projectId);
        await uploadProjectFiles(projectId, formData);
      }
    } catch {
      // Import error handled silently — file list will refresh
    }
    // Refresh file status
    setShowUploader((v) => !v);
    setTimeout(() => setShowUploader(false), 0);
  };

  const handleCardClick = () => {
    setShowUploader(true);
  };

  return (
    <>
      <Card size="full" className="group relative h-28">
        <div className="flex items-center justify-between w-full mb-1">
          <Text className="font-semibold text-gray-900 dark:text-gray-200">
            {t('project-files')}
          </Text>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <PlusIcon className="size-5 text-zinc-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-2">
              <DropdownMenuItem
                className="py-2.5"
                onClick={() => setShowUploader(true)}
              >
                <ArrowUpTrayIcon className="size-4" />
                {tAttach('upload-file')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="py-2.5"
                onClick={() => setIsKbPickerOpen(true)}
              >
                <BookOpenIcon className="size-4" />
                {tAttach('from-knowledge-base')}
              </DropdownMenuItem>
              {hasDriveConnector && (
                <DropdownMenuItem
                  className="py-2.5"
                  onClick={() => setIsDrivePickerOpen(true)}
                >
                  <img
                    src="/assets/connectors/google-drive.svg"
                    alt="Google Drive"
                    className="size-4"
                  />
                  {tAttach('from-google-drive')}
                </DropdownMenuItem>
              )}
              {hasFirefliesConnector && (
                <DropdownMenuItem
                  className="py-2.5"
                  onClick={() => setIsFirefliesPickerOpen(true)}
                >
                  <img
                    src="/assets/connectors/fireflies.svg"
                    alt="Fireflies"
                    className="size-4"
                  />
                  {tAttach('from-fireflies')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="cursor-pointer flex-1" onClick={handleCardClick}>
          <ProjectFileUploadContent status={fileStatus} t={t} compact />
        </div>
      </Card>

      <Dialog
        className="max-h-[500px] overflow-y-auto"
        open={showUploader}
        onClose={() => setShowUploader(false)}
      >
        <ProjectFileUpload
          projectId={projectId}
          initialFileCount={fileStatus.fileCount}
        />
      </Dialog>

      <KnowledgeBasePickerDialog
        open={isKbPickerOpen}
        onOpenChange={setIsKbPickerOpen}
        onFilesSelected={handleKbFilesSelected}
      />

      <GoogleDrivePickerDialog
        open={isDrivePickerOpen}
        onOpenChange={setIsDrivePickerOpen}
        onFileSelected={handleExternalFileSelected}
      />

      <FirefliesPickerDialog
        open={isFirefliesPickerOpen}
        onOpenChange={setIsFirefliesPickerOpen}
        onFileSelected={handleExternalFileSelected}
      />
    </>
  );
};
