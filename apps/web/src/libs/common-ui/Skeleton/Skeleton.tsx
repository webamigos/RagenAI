/*
 * Moved out of libs/tui, where it did not belong: this is the repository's own
 * component, not part of the third-party kit that directory held — no
 * @headlessui/react, its own `card`/`borderRadius` props, and it imports this
 * package's own `classMerge`.
 *
 * That mattered beyond tidiness. libs/tui carried a LICENSE saying its files
 * were third-party and could not be redistributed apart from Ragen, so keeping
 * our own code there under-licensed our own work and told a downstream reader
 * something untrue about it. That directory is gone now (ADR-41), but the
 * reason this component sits here has not changed.
 *
 * common-ui already presented it as its own through a six-line re-export
 * shim pointing back at libs/tui. The implementation now lives where the shim
 * always claimed it did.
 */
'use client';

import { memo, type ReactNode } from 'react';
import { classMerge } from '../utils/cn';

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
  // One ramp step apart in both themes, on purpose: a placeholder that shares
  // its card's surface is invisible. The literal `gray-100`/`gray-200` this
  // replaces had that separation in light only, and the sweep's `bg-muted`
  // would have lost it in light as well by collapsing both onto one token.
  const bgColor = card
    ? 'bg-paper-100 dark:bg-paper-900'
    : 'bg-paper-200 dark:bg-paper-700';
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
          'p-4 border border-border dark:border-none rounded-md',
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
