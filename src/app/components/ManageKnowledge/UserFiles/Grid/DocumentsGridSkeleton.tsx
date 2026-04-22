import { Skeleton } from '@ragenai/tui/skeleton';

const FileCardSkeleton = () => (
  <div className="flex flex-col bg-slate-100 dark:bg-accent-dark-500 rounded-lg shadow-sm overflow-hidden">
    <div className="px-3 py-2 flex items-center gap-2">
      <Skeleton height="h-4" width="w-4" borderRadius="rounded" />
      <Skeleton height="h-3" width="w-28" />
    </div>
    <div className="relative mx-3 mb-1 rounded overflow-hidden aspect-[1/1.3]">
      <Skeleton height="h-full" width="w-full" borderRadius="rounded" />
    </div>
    <div className="px-3 py-2 flex items-center justify-between">
      <Skeleton height="h-3" width="w-16" />
      <Skeleton height="h-3" width="w-10" />
    </div>
  </div>
);

export const DocumentsGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-4 px-0.5">
    {Array.from({ length: 9 }).map((_, i) => (
      <FileCardSkeleton key={i} />
    ))}
  </div>
);
