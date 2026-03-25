'use client';

import React, { useCallback } from 'react';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

export type DropZoneConfig = {
  label: string;
  onDrop: (files: File[]) => void;
  icon?: React.ReactNode;
};

type PageDropOverlayProps = {
  /** Whether the overlay is visible (controlled by usePageDrop) */
  visible: boolean;
  /** Drop zones to display. Single = centered. Multiple = side by side. */
  zones: DropZoneConfig[];
};

export function PageDropOverlay({ visible, zones }: PageDropOverlayProps) {
  if (!visible || zones.length === 0) {
    return null;
  }

  const isSingleZone = zones.length === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div
        className={`flex ${isSingleZone ? 'items-center justify-center' : 'items-stretch gap-6 px-8'} w-full max-w-4xl mx-auto`}
      >
        {zones.map((zone, index) => (
          <DropTarget key={index} zone={zone} isSingleZone={isSingleZone} />
        ))}
      </div>
    </div>
  );
}

function DropTarget({
  zone,
  isSingleZone,
}: {
  zone: DropZoneConfig;
  isSingleZone: boolean;
}) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        zone.onDrop(files);
      }
    },
    [zone],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/30 ${
        isSingleZone ? 'w-full max-w-lg p-16' : 'flex-1 p-12'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {zone.icon || <CloudArrowUpIcon className="size-12 text-blue-500 mb-4" />}
      <p className="text-base font-medium text-blue-600 dark:text-blue-400 text-center">
        {zone.label}
      </p>
    </div>
  );
}
