'use client';

import { useState, useEffect, memo } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { Suspense, lazy } from 'react';

import { FileUploader } from '@ragenai/common-ui/FileUploader';
import { Button } from '@ragenai/common-ui/Button';
import { Skeleton } from '@/app/components';
import { UploadList } from '../UploadList';
import {
  ErrorBoundary,
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
  projectId: number;
  projectPublicId: string;
};

const LoadingView = () => (
  <div className="p-4">
    <Skeleton height="h-6" width="w-48" className="mb-4" />
    <Skeleton height="h-32" width="w-full" className="mb-4" />
  </div>
);

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
              <UploadList
                files={files}
                onRemoveFile={onRemoveFile}
                uploading={uploading}
              />
            )}
          </div>
          <Button
            disabled={uploading || files.length < 1}
            isLoading={uploading}
            isSubmit={!uploading}
            onClick={onSend}
            label={t('upload.button')}
            className="self-start mt-8"
          />
        </div>
      </div>
    );
  }
);

UploadView.displayName = 'UploadView';

export const ProjectFileUpload = ({ projectId, projectPublicId }: Props) => {
  const [componentState, setComponentState] = useState<ComponentState>(
    ComponentState.INITIALIZING
  );

  const { files, uploading, handleFilesAdded, handleFileRemove, uploadFiles } =
    useFileUpload(projectId, projectPublicId);

  const t = useTranslations('projects');
  const { organization } = useOrganization();

  const handleFilesLoaded = (hasFiles: boolean) => {
    setComponentState(
      hasFiles ? ComponentState.HAS_FILES : ComponentState.NO_FILES
    );
  };

  // Handle file upload action
  const handleSend = async () => {
    const success = await uploadFiles();
    if (success) {
      // Force refresh project files list after upload
      setComponentState(ComponentState.HAS_FILES);
    }
  };

  // Check for organization on component mount
  useEffect(() => {
    if (organization) {
      // Initial state will be determined by ProjectFilesList callback
    }
  }, [projectId, organization]);

  if (!organization) {
    return null;
  }

  // Render the appropriate view based on component state
  switch (componentState) {
    case ComponentState.INITIALIZING:
      return (
        <div className="p-4">
          <Skeleton height="h-6" width="w-48" className="mb-4" />
          <Skeleton height="h-32" width="w-full" className="mb-4" />
          <ErrorBoundary
            fallback={
              <FileErrorFallback
                error={new Error('Failed to load files')}
                resetErrorBoundary={() => {}}
              />
            }
          >
            <Suspense fallback={<LoadingView />}>
              <ProjectFilesList
                projectId={projectId}
                projectPublicId={projectPublicId}
                onFilesLoaded={handleFilesLoaded}
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
          <Suspense fallback={<LoadingView />}>
            <ProjectFilesList
              projectId={projectId}
              projectPublicId={projectPublicId}
              onFilesLoaded={handleFilesLoaded}
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
      return <LoadingView />;
  }
};
