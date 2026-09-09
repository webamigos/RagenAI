'use client';

import { type ComponentProps } from 'react';

import { classMerge } from '@ragenai/common-ui/utils/cn';
import { ListIcon, GridIcon } from '@ragenai/common-ui/icons';

const VIEW_MODE_KEY = 'ragen:files-view-mode';

export function getSavedViewMode(): 'list' | 'grid' {
  if (typeof window === 'undefined') {
    return 'list';
  }
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  return saved === 'grid' ? 'grid' : 'list';
}

type LayoutToggleProps = ComponentProps<'div'> & {
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
};

export const LayoutToggle = ({
  className,
  viewMode,
  onViewModeChange,
}: LayoutToggleProps) => {
  const handleViewModeChange = (mode: 'list' | 'grid') => {
    onViewModeChange(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  return (
    <div
      className={classMerge(
        'flex items-center justify-center p-0.5 rounded-md border border-border w-fit',
        className,
      )}
    >
      <button
        onClick={() => handleViewModeChange('list')}
        className={`flex items-center px-4 py-2 rounded-md transition ${
          viewMode === 'list'
            ? 'dark:bg-muted bg-muted text-foreground'
            : 'text-muted-foreground'
        } `}
      >
        <ListIcon />
      </button>
      <button
        onClick={() => handleViewModeChange('grid')}
        className={`flex items-center px-4 py-2 rounded-md transition ${
          viewMode === 'grid'
            ? 'dark:bg-muted bg-muted text-foreground'
            : 'text-muted-foreground'
        } `}
      >
        <GridIcon />
      </button>
    </div>
  );
};
