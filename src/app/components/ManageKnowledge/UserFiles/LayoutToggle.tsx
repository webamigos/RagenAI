import { type ComponentProps } from 'react';

import { classMerge, ListIcon, GridIcon } from '@ragenai/common-ui';
import { saveUserMetadata } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';

type LayoutToggleProps = ComponentProps<'div'> & {
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  clerkUserId: string;
};

export const LayoutToggle = ({
  className,
  viewMode,
  clerkUserId,
  onViewModeChange,
}: LayoutToggleProps) => {
  const { errorToast } = statusToast();

  const handleViewModeChange = async (mode: 'list' | 'grid') => {
    onViewModeChange(mode);

    try {
      await saveUserMetadata(clerkUserId, { viewMode: mode });
    } catch (error) {
      errorToast({
        message: `${{ err: error }}Failed to save viewMode preference:`,
      });
    }
  };

  return (
    <div
      className={classMerge(
        'flex items-center justify-center p-0.5 rounded-full border border-gray-400 dark:border-accent-dark-700 w-fit',
        className
      )}
    >
      <button
        onClick={() => handleViewModeChange('list')}
        className={`flex items-center px-4 py-2 rounded-full transition ${
          viewMode === 'list'
            ? 'dark:bg-slate-600 bg-slate-200 text-black'
            : 'text-gray-600'
        } `}
      >
        <ListIcon />
      </button>
      <button
        onClick={() => handleViewModeChange('grid')}
        className={`flex items-center px-4 py-2 rounded-full transition ${
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
