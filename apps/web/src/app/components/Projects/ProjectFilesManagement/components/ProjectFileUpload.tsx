'use client';

import { useState } from 'react';
import { useOrganization } from '@/app/hooks/use-auth';
import { Suspense, lazy } from 'react';

import { LoadingSkeleton } from '@ragenai/common-ui/Skeleton';
import { ErrorBoundaryWithTranslations as ErrorBoundary } from '@/app/components/ErrorBoundary';

const ProjectFilesList = lazy(() =>
  import('./ProjectFilesList').then((mod) => ({
    default: mod.ProjectFilesList,
  })),
);

interface Props {
  projectId: string;
  initialFileCount?: number;
}

export const ProjectFileUpload = ({ projectId, initialFileCount }: Props) => {
  const { organization } = useOrganization();
  const [resetKey, setResetKey] = useState(0);

  if (!organization) {
    return null;
  }

  return (
    <ErrorBoundary key={resetKey} onReset={() => setResetKey((k) => k + 1)}>
      <Suspense fallback={<LoadingSkeleton />}>
        <ProjectFilesList
          projectId={projectId}
          initialFileCount={initialFileCount}
        />
      </Suspense>
    </ErrorBoundary>
  );
};
