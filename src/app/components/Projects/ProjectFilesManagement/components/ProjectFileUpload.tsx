'use client';

import { useState, useEffect, memo } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/app/hooks/use-auth';
import { Suspense, lazy } from 'react';

import { FileUploader } from '@ragenai/common-ui/FileUploader';
import { Button, LoadingSkeleton } from '@ragenai/common-ui';
import { UploadList } from '../../../ManageKnowledge/UploadKnowledge/UploadList';
import {
  ErrorBoundaryWithTranslations as ErrorBoundary,
  FileErrorFallback,
} from '@/app/components/ErrorBoundary';

const ProjectFilesList = lazy(() =>
  import('./ProjectFilesList').then((mod) => ({
    default: mod.ProjectFilesList,
  }))
);

enum ComponentState {
  INITIALIZING,
  HAS_FILES,
  NO_FILES,
}

import { useFileUpload } from '@/app/hooks/useFileUpload';

type Props = {
  projectPublicId: string;
  initialFileCount?: number;
};

const UploadView = memo(
  ({
    files,
    onFilesAdded,
    onRemoveFile,
    onSend,
    uploading,
    t,
  }: {
    files: File[];
    onFilesAdded: (files: File[]) => void;
    onRemoveFile: (index: number) => void;
    onSend: () => Promise<void>;
    uploading: boolean;
    t: any;
  }) => {
    return (
      <div className="p-4">
        <h3 className="text-lg font-medium mb-4">{t('upload.title')}</h3>
        <div className="flex gap-4 items-start">
          <div className="flex-1">
            <FileUploader
              onFilesAdded={onFilesAdded}
              disabled={uploading}
              className="min-h-0"
            />
            {files.length > 0 && (
              <>
                <UploadList
                  files={files}
                  onRemoveFile={onRemoveFile}
                  uploading={uploading}
                />

                <Button
                  disabled={uploading}
                  isLoading={uploading}
                  isSubmit={!uploading}
                  onClick={onSend}
                  className="self-start mt-4"
                >
                  {t('upload.button')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);

UploadView.displayName = 'UploadView';

export const ProjectFileUpload = ({
  projectPublicId,
  initialFileCount,
}: Props) => {
  const [componentState, setComponentState] = useState<ComponentState>(
    ComponentState.INITIALIZING
  );

  const { files, uploading, handleFilesAdded, handleFileRemove, uploadFiles } =
    useFileUpload(projectPublicId);

  const t = useTranslations('projects');
  const { organization } = useOrganization();

  const handleFilesLoaded = (hasFiles: boolean) => {
    setComponentState(
      hasFiles ? ComponentState.HAS_FILES : ComponentState.NO_FILES
    );
  };

  const handleSend = async () => {
    const success = await uploadFiles();
    if (success) {
      setComponentState(ComponentState.HAS_FILES);
    }
  };

  useEffect(() => {
    if (organization) {
    }
  }, [projectPublicId, organization]);

  if (!organization) {
    return null;
  }

  switch (componentState) {
    case ComponentState.INITIALIZING:
      return (
        <div className="min-h-32 w-full">
          <ErrorBoundary
            fallback={
              <FileErrorFallback
                error={new Error('Failed to load files')}
                resetErrorBoundary={() => {}}
              />
            }
          >
            <Suspense fallback={<LoadingSkeleton />}>
              <ProjectFilesList
                projectPublicId={projectPublicId}
                onFilesLoaded={handleFilesLoaded}
                initialFileCount={initialFileCount || files.length}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      );

    case ComponentState.HAS_FILES:
      return (
        <ErrorBoundary
          fallback={
            <FileErrorFallback
              error={new Error('Failed to load files')}
              resetErrorBoundary={() =>
                setComponentState(ComponentState.INITIALIZING)
              }
            />
          }
        >
          <Suspense fallback={<LoadingSkeleton />}>
            <ProjectFilesList
              projectPublicId={projectPublicId}
              onFilesLoaded={handleFilesLoaded}
              initialFileCount={initialFileCount || files.length}
            />
          </Suspense>
        </ErrorBoundary>
      );

    case ComponentState.NO_FILES:
      return (
        <UploadView
          files={files}
          onFilesAdded={handleFilesAdded}
          onRemoveFile={handleFileRemove}
          onSend={handleSend}
          uploading={uploading}
          t={t}
        />
      );

    default:
      return <LoadingSkeleton />;
  }
};
