'use client';

import { useOrganization } from '@/app/hooks/use-auth';
import { Suspense, lazy } from 'react';

import { LoadingSkeleton } from '@ragenai/common-ui/Skeleton';
import {
  ErrorBoundaryWithTranslations as ErrorBoundary,
  FileErrorFallback,
} from '@/app/components/ErrorBoundary';

const ProjectFilesList = lazy(() =>
  import('./ProjectFilesList').then((mod) => ({
    default: mod.ProjectFilesList,
  })),
);

type Props = {
  projectPublicId: string;
  initialFileCount?: number;
};

export const ProjectFileUpload = ({
  projectPublicId,
  initialFileCount,
}: Props) => {
  const { organization } = useOrganization();

  if (!organization) {
    return null;
  }

  return (
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
          initialFileCount={initialFileCount}
        />
      </Suspense>
    </ErrorBoundary>
  );
};
