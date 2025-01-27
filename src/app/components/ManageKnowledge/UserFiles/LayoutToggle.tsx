import { type ComponentProps } from 'react';

import { ListIcon, GridIcon } from '@ragenai/common-ui/icons';

import { classMerge } from '@ragenai/common-ui/index';

type LayoutToggleProps = ComponentProps<'div'> & {
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
};

export const LayoutToggle = ({
  className,
  viewMode,
  onViewModeChange,
}: LayoutToggleProps) => {
  return (
    <div
      className={classMerge(
        'flex items-center justify-center p-0.5 rounded-full border border-gray-400 w-fit',
        className
      )}
    >
      <button
        onClick={() => onViewModeChange('list')}
        className={`flex items-center px-4 py-2 rounded-full transition ${
          viewMode === 'list' ? 'bg-blue-200 text-black' : 'text-gray-600'
        }`}
      >
        <ListIcon />
      </button>
      <button
        onClick={() => onViewModeChange('grid')}
        className={`flex items-center px-4 py-2 rounded-full transition ${
          viewMode === 'grid' ? 'bg-blue-200 text-black' : 'text-gray-600'
        }`}
      >
        <GridIcon />
      </button>
    </div>
  );
};
