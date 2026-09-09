import { Skeleton } from '@ragenai/common-ui/Skeleton';

const ChatRowSkeleton = () => (
  <div className="flex items-center gap-3 py-3 -mx-2 px-2">
    <div className="flex-1 min-w-0 space-y-1.5">
      <Skeleton height="h-4" width="w-48" />
      <Skeleton height="h-3" width="w-28" />
    </div>
    <Skeleton height="h-5" width="w-5" borderRadius="rounded" />
  </div>
);

export const ChatsListSkeleton = () => (
  <div className="divide-y divide-border">
    {Array.from({ length: 8 }).map((_, i) => (
      <ChatRowSkeleton key={i} />
    ))}
  </div>
);
