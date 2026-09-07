import { Skeleton } from '@ragenai/common-ui/Skeleton';

export const ThreadsListSkeleton = () => (
  <div className="space-y-3 w-11/12">
    <Skeleton height="h-3" width="w-16" className="mx-2" />
    <div className="space-y-0.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} height="h-8" borderRadius="rounded-md" />
      ))}
    </div>
  </div>
);
