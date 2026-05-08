'use client';

import { memo, type ReactNode } from 'react';
import { classMerge } from '@ragenai/common-ui/utils/cn';

type SkeletonProps = {
  height?: string;
  width?: string;
  className?: string;
  borderRadius?: string;
  children?: ReactNode;
  card?: boolean;
};

export const Skeleton = ({
  height = 'h-24',
  width = 'w-full',
  className = '',
  borderRadius = 'rounded',
  children,
  card = false,
}: SkeletonProps) => {
  const animation = 'animate-pulse';
  const bgColor = card
    ? 'bg-zinc-100 dark:bg-zinc-700/60'
    : 'bg-zinc-200 dark:bg-zinc-700';
  const skeletonClass = classMerge(
    height,
    width,
    animation,
    bgColor,
    borderRadius,
    className,
  );

  if (children) {
    return <div className={skeletonClass}>{children}</div>;
  }

  if (card) {
    return (
      <div
        className={classMerge(
          'p-4 border border-gray-200 dark:border-none rounded-md',
          width,
        )}
      >
        <div className={skeletonClass} />
      </div>
    );
  }

  return <div className={skeletonClass} />;
};

export const SkeletonList = ({
  count = 3,
  height = 'h-16',
  gap = 'gap-2',
  className = '',
  card = false,
}: {
  count?: number;
  height?: string;
  gap?: string;
  className?: string;
  card?: boolean;
}) => {
  const containerClass = classMerge('flex flex-col', gap, className);
  return (
    <div className={containerClass}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} card={card} />
      ))}
    </div>
  );
};

export const PageSkeleton = () => (
  <div className="flex flex-col h-screen justify-center items-center gap-2 px-4">
    <div className="w-full max-w-3xl">
      <div className="flex flex-col items-center justify-center text-center">
        <Skeleton height="h-8" width="w-64" card />
        <Skeleton height="h-5" width="w-96" card />
      </div>
      <div className="w-full">
        <Skeleton height="h-24" width="w-full" borderRadius="rounded-lg" card />
      </div>
      <div className="mx-auto w-full max-w-[740px]">
        <Skeleton height="h-16" width="w-full" borderRadius="rounded-lg" card />
      </div>
    </div>
  </div>
);

export const LoadingSkeleton = memo(() => (
  <div className="w-full p-4">
    <div className="mb-4">
      <Skeleton height="h-6" width="w-32" />
    </div>
    <div className="space-y-2">
      <Skeleton height="h-16" width="w-full" card />
      <Skeleton height="h-16" width="w-full" card />
      <Skeleton height="h-16" width="w-full" card />
    </div>
  </div>
));

LoadingSkeleton.displayName = 'LoadingSkeleton';
