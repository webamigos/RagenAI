'use client';

import { ReactNode } from 'react';
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
 * Reużywalny komponent Skeleton do pokazania podczas ładowania danych
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

  // Jeśli przekazano children, to renderujemy je jako zawartość
  if (children) {
    return <div className={baseStyle}>{children}</div>;
  }

  // Możliwość renderowania jako Card
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

  // Podstawowy skeleton
  return <div className={baseStyle} />;
};

/**
 * Komponent rozszerzający Skeleton o możliwość generowania wielu elementów w liście
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
 * Komponent Skeleton Page specyficzny dla strony projektu
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
