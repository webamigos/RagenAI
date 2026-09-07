import { Skeleton } from '@ragenai/common-ui/Skeleton';

const AssistantCardSkeleton = () => (
  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 min-h-[120px] flex flex-col justify-between">
    <div className="flex items-center gap-3">
      <Skeleton height="h-5" width="w-5" borderRadius="rounded" />
      <Skeleton height="h-4" width="w-32" />
    </div>
    <div className="flex items-center gap-3 mt-4">
      <Skeleton height="h-3" width="w-16" />
      <Skeleton height="h-3" width="w-20" />
    </div>
  </div>
);

export const AssistantsGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <AssistantCardSkeleton key={i} />
    ))}
  </div>
);
