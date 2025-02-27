'use client';

import { memo, ReactNode } from 'react';
import { classMerge } from '@ragenai/common-ui';

type SkeletonProps = {
  height?: string;
  width?: string;
  className?: string;
  borderRadius?: string;
  children?: ReactNode;
  card?: boolean;
};

/**
 * Reusable Skeleton component to display during data loading
 */
export const Skeleton = ({
  height = 'h-24',
  width = 'w-full',
  className = '',
  borderRadius = 'rounded',
  children,
  card = false,
}: SkeletonProps) => {
  const baseStyle = classMerge(
    'animate-pulse bg-gray-200 dark:bg-gray-700',
    height,
    width,
    borderRadius,
    className
  );

  if (children) {
    return <div className={baseStyle}>{children}</div>;
  }

  if (card) {
    return (
      <div
        className={classMerge(
          'p-4 border border-gray-200 dark:border-gray-700 rounded-md',
          width
        )}
      >
        <div className={baseStyle} />
      </div>
    );
  }

  return <div className={baseStyle} />;
};

/**
 * Skeleton component that can generate multiple elements in a list
 */
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
  return (
    <div className={classMerge('space-y-2', gap, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} card={card} />
      ))}
    </div>
  );
};

/**
 * Skeleton Page component specific to the project page
 */
export const PageSkeleton = () => (
  <div className="flex flex-col h-screen justify-center items-center gap-4">
    <Skeleton height="h-24" />
    <div className="flex w-full max-w-[740px] gap-4 flex-col">
      <div className="flex-1">
        <Skeleton height="h-12" />
      </div>
      <div className="flex-1">
        <Skeleton height="h-64" />
      </div>
    </div>
  </div>
);

/**
 * Loading Skeleton component for general loading states
 */
export const LoadingSkeleton = memo(() => {
  return (
    <div className="w-full p-4">
      <div className="mb-4">
        <Skeleton height="h-6" width="w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton height="h-16" width="w-full" />
        <Skeleton height="h-16" width="w-full" />
        <Skeleton height="h-16" width="w-full" />
      </div>
    </div>
  );
});

LoadingSkeleton.displayName = 'LoadingSkeleton';
