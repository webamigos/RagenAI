'use client';

import { Skeleton } from '@ragenai/tui/skeleton';

const SkeletonRow = () => (
  <tr>
    <td className="py-3 px-4">
      <span className="flex items-center gap-2">
        <Skeleton height="h-5" width="w-5" borderRadius="rounded" />
        <Skeleton height="h-4" width="w-48" />
      </span>
    </td>
    <td className="py-3 px-4">
      <Skeleton height="h-4" width="w-12" />
    </td>
    <td className="py-3 px-4">
      <Skeleton height="h-4" width="w-20" />
    </td>
    <td className="py-3 px-4">
      <Skeleton height="h-5" width="w-16" borderRadius="rounded-full" />
    </td>
    <td className="py-3 px-4">
      <Skeleton height="h-5" width="w-5" />
    </td>
  </tr>
);

export const DocumentsTableSkeleton = () => (
  <div className="relative">
    <table className="w-full">
      <tbody>
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </tbody>
    </table>
  </div>
);
