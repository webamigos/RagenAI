'use client';

import { memo } from 'react';
import { Card } from '@ragenai/common-ui';
import { Skeleton } from '@/app/components';

export const LoadingSkeleton = memo(() => {
  return (
    <Card className="w-full p-4 min-h-[400px]">
      <div className="mb-4">
        <Skeleton height="h-6" width="w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton height="h-16" width="w-full" />
        <Skeleton height="h-16" width="w-full" />
        <Skeleton height="h-16" width="w-full" />
      </div>
    </Card>
  );
});

LoadingSkeleton.displayName = 'LoadingSkeleton';
