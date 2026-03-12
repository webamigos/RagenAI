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
        'flex items-center justify-center p-0.5 rounded-md border border-zinc-950/10 dark:border-white/10 w-fit',
        className,
      )}
    >
      <button
        onClick={() => handleViewModeChange('list')}
        className={`flex items-center px-4 py-2 rounded-md transition ${
          viewMode === 'list'
            ? 'dark:bg-slate-500 bg-slate-200 text-black'
            : 'text-gray-500'
        } `}
      >
        <ListIcon />
      </button>
      <button
        onClick={() => handleViewModeChange('grid')}
        className={`flex items-center px-4 py-2 rounded-md transition ${
          viewMode === 'grid'
            ? 'dark:bg-slate-600 bg-slate-200 text-black'
            : 'text-gray-600'
        } `}
      >
        <GridIcon />
      </button>
    </div>
  );
};
